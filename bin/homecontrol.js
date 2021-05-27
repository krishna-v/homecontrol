const http = require('http');
const statsrv = require('node-static');
const fs = require('fs');

// Point HBEPath to the location of hue-bridge-emulator
const HBEPath = '/usr/local/share/hue-bridge-emulator';
const HueBridgeEmulator = require(HBEPath + '/hue-bridge-emulator');
const devdb = HBEPath + '/devicedb';


// Port on which the Web UI runs.
// The Hue Emulator runs on 80 so this must be different.
const port = 8080;

// Location of web UI files.
const documentroot = '/usr/local/share/homecontrol/public';

// hue-bridge-emulator runs on this port (Has to be 80 for Alexa integration.)
const hueport = 80;

// -------------------------------------------------------------------------

const hueMap = {};

function logMessage(level, message) {
	const ts = new Date().toLocaleString( 'sv', { timeZoneName: 'short' } ).replace(/ GMT.*/, "");
	console.log(ts + ": " + level + ": " + message);
}

try {
	var model = JSON.parse(fs.readFileSync(documentroot + '/model.json'));
} catch(e) {
	logMessage("FATAL", "Error loading model.json. " + e.message);
}

const file = new statsrv.Server(documentroot);

function servestatic(req,res) {
	file.serve(req, res);
}

function _doRemoteCmd(host, port, cmdpath) {
	const options = {
		hostname: host,
		port: port,
		path: cmdpath,
		method: 'GET',
		timeout: 3000
	};

	const promise = new Promise((resolve, reject) => {
		http.get(options, (res) => {
			const { statusCode } = res;
			if (statusCode !== 200 && statusCode !== 204) {
				res.resume();
				reject(Error('Request Failed.\n' + `Status Code: ${statusCode}`));
			}
			res.setEncoding('utf8');
			let rawData = '';
			res.on('data', (chunk) => { rawData += chunk; });
			res.on('end', () => { resolve(rawData); });
		}).on('error',((e) => { reject(e); }));
	});
	return promise;
}

function relayKNXCmd(room_id, ctrl_id, key, value) {
	logMessage("INFO", "relayKNXCmd: Turning " + (value == "1" ? "on " : "off ") +
		model.rooms[room_id].name + " " + model.rooms[room_id].ctrls[ctrl_id].name);
	const host = model.rooms[room_id].ctrls[ctrl_id].host;	
	const cmdstr = '/cgi-bin/writeVal.cgi?KNX.g%5B' + room_id + '%5D.f%5B' + ctrl_id + '%5D.v%5B1%5D+' + value;
	_doRemoteCmd(host, 80, cmdstr).catch((e) => { logMessage("WARN", 'relayKNXCmd: ' + e.message); });
}

function relayTasmotaCmd(room_id, ctrl_id, key, value) {
	const host = model.rooms[room_id].ctrls[ctrl_id].host;	
    const name = model.rooms[room_id].name + " " + model.rooms[room_id].ctrls[ctrl_id].name;
	let cmdstr = '';
	if(key == 'value' || key == 'state') {
		logMessage("INFO", "relayTasmotaCmd: Turning " + ((value == "1") ? "on " : "off ") + name);
		cmdstr = '/cm?cmnd=POWER0%20' + value;
	} else if(key == 'color') {
		logMessage("INFO", "relayTasmotaCmd: Setting " + name + " color to " + value);
		cmdstr = '/cm?cmnd=Color%20' + value;
	} else if(key == 'hsb') {
		logMessage("INFO", `Setting ${name} HSB Color to ${value[0]},${value[1]},${value[2]}`);
		cmdstr = `/cm?cmnd=HSBColor%20${value[0]},${value[1]},${value[2]}`;
	} else if(key == 'ct') {
		logMessage("INFO", `Setting ${name} CT to ${value[0]},${value[1]}`);
		cmdstr = `/cm?cmnd=Backlog%20White%20${value[0]}%20CT%20${value[1]}`;
	} else {
		logMessage("WARN", "relayTasmotaCmd: Dropped unknown Command " + cmd + " to " +
			model.rooms[room_id].name + " " + model.rooms[room_id].ctrls[ctrl_id].name);
		return;
	}
	// logMessage("INFO", "Relaying Cmd " + cmdstr + " to " + host);
	_doRemoteCmd(host, 80, cmdstr).catch((e) => { logMessage("WARN", 'relayTasmotaCmd: ' + e.message); });
}

function relayCmd(room_id, ctrl_id, state_info) {
    const protocol = model.rooms[room_id].ctrls[ctrl_id].protocol;
    let cmdfunc = null;
	if(protocol == 'tasmota') {
		cmdfunc = relayTasmotaCmd;
	} else if(protocol == 'knx') {
		cmdfunc = relayKNXCmd;
	} else {
		logMessage("WARN", 'relayCmd: Unknown protocol ' + protocol + ' for ' + room_id + '.' + ctrl_id);
	}
    if(typeof state_info === "string") {
        const parts = state_info.split('=');
        cmdfunc(room_id, ctrl_id, parts[0], parts[1]);
    } else {
        for(let key in state_info) cmdfunc(room_id, ctrl_id, key, state_info[key]);
    }
}

function setControlState(room_id, ctrl_id, state_info) {
	const now = Date.now();
	const ctrl = model.rooms[room_id].ctrls[ctrl_id];
	let updated = false;

	model.lastChanged = now;
	for(let key in state_info) {
		let val = "*none*";
		if(ctrl[key] !== undefined && ctrl[key] != null) val = ctrl[key];
		if(state_info[key] !== val) {
			logMessage("INFO", "setControlState: " +
				model.rooms[room_id].name + " " + ctrl.name +
				" > " + key + " changed from " + val + " to " + state_info[key]);
			ctrl[key] = state_info[key];
			ctrl.lastChanged = now;
			updated = true;
		}
	}
	// if(updated) mqtt_update_control_state(mqttcon, model, room_id, ctrl_id);
}

function loadTasmotaState(room, ctrl, host) {
	_doRemoteCmd(host, 80, '/cm?cmnd=Status%2011').then((data) => {
		try {
			const info = JSON.parse(data);
			const state = info.StatusSTS.POWER.toLowerCase();
			const color = info.StatusSTS.Color === undefined ? "ffffff" : info.StatusSTS.Color;
			const hueState = {};
			hueState.reachable = true;
			hueState.on = (state == "on");
			// TODO: Begin Kludge for non RGB lights.
			const hsbcolor = info.StatusSTS.HSBColor;
			if(hsbcolor !== undefined) {
				const hsb = info.StatusSTS.HSBColor.split(',').map(x => parseInt(x));
				hueState.hue = hsb[0] * 182;
				hueState.sat = hsb[1];
				if(info.StatusSTS.White == 0) {
					hueState.colormode = "hs";
					hueState.bri = hsb[2];
				} else {
					const white = info.StatusSTS.White === undefined ? 100 : info.StatusSTS.White;
					hueState.colormode = "ct";
					hueState.bri = Math.round(white * 254 / 100);
				}
			}
			setControlState(room, ctrl, { "state": state, "color": color });
			hbe.setState(model.rooms[room].ctrls[ctrl].hueid, hueState);
		} catch(e) {
			logMessage("WARN", 'loadTasmotaState: ' + e.message + ' for ' + host);
		}
	}, (e) => { 
		if(e.code === 'EHOSTUNREACH') {
			 // host offline.
			if(model.rooms[room].ctrls[ctrl].state !== "offline") {
				logMessage("WARN", 'loadTasmotaState: ' + e.message + ' for ' + host);
				setControlState(room, ctrl, { "state": "offline" });
				hbe.setState(model.rooms[room].ctrls[ctrl].hueid, { reachable: false });
			}
		} else logMessage("WARN", 'loadTasmotaState: ' + e.message + ' for ' + host);
	});
}

function loadKNXState(room, ctrl, host) {
	const arg = '/cgi-bin/readVal.cgi?KNX.g%5B' + room + '%5D.f%5B' + ctrl + '%5D.v%5B2%5D';
	_doRemoteCmd(host, 80, arg).then((data) => {;
		try {
			if(data !== "0" && data !== "1") {
				logMessage("WARN", "loadKNXState: received data for room " + room + ", ctrl " + ctrl + " : " + data);
			}
		} catch(e) {
			logMessage("WARN", 'loadKNXState: ' + e.message + ' for ' + room + "." + ctrl);
			// setControlState(room, ctrl, { "state": "offline" });
		}
		const state = (data == "1") ? "on" : "off";
		setControlState(room, ctrl, { "state": state });
        hbe.setState(model.rooms[room].ctrls[ctrl].hueid, { reachable: true, on: (state == "on") });
	}, (e) => { 
		if(e.code === 'EHOSTUNREACH') {
			 // host offline.
			if(model.rooms[room].ctrls[ctrl].state !== "offline") {
				logMessage("WARN", 'loadKNXState: ' + e.message + ' for ' + room + "." + ctrl);
				setControlState(room, ctrl, { "state": "offline" });
                hbe.setState(model.rooms[room].ctrls[ctrl].hueid, { reachable: false });
			}
		} else logMessage("WARN", 'loadKNXState: ' + e.message + ' for ' + room + "." + ctrl);
	});
}

function initControlRead(m) {
	for(let room_id in m.rooms) {
		for(let ctrl_id in m.rooms[room_id].ctrls) {
			const protocol = m.rooms[room_id].ctrls[ctrl_id].protocol;
			const host = m.rooms[room_id].ctrls[ctrl_id].host;
			if(protocol == 'tasmota') {
				setInterval(loadTasmotaState, 5000, room_id, ctrl_id, host);
			} else if(protocol == 'knx') {
				setInterval(loadKNXState, 5000, room_id, ctrl_id, host);
			} else if(protocol == 'none') {
				// Do nothing
			} else {
				logMessage("WARN", 'initControlRead: Unknown protocol ' + protocol + ' for ' + room_id + '.' + ctrl_id);
			}

		}
	}
}

function hueSetup(hbe, m, huemap) {
	for(let room in m.rooms) {
		for(let ctrl in m.rooms[room].ctrls) {
			const type = m.rooms[room].ctrls[ctrl].type;
            if (!["LIGHT", "FAN", "GEYSER", "SMARTLIGHT"].includes(type)) continue;
            const lightspec = {};
            lightspec.name = `${m.rooms[room].name} ${m.rooms[room].ctrls[ctrl].name}`;
            lightspec.model = (type == "SMARTLIGHT") ? "LCT016" : "LOM001";
            lightspec.override = { uniqueid: `00:17:88:01:${room.padStart(2,'0')}:${ctrl.padStart(2,'0')}:01:01-0b` }
            const hueid = hbe.addLight(lightspec);
			m.rooms[room].ctrls[ctrl].hueid = hueid;
            huemap[hueid] = { "room": room, "ctrl": ctrl };
		}
	}
}

function generateStateMap(m) {
	const sm = new Map();
	for(let room_id in m.rooms) {
		for(let ctrl_id in m.rooms[room_id].ctrls) {
			const state = m.rooms[room_id].ctrls[ctrl_id].state;
			const color = m.rooms[room_id].ctrls[ctrl_id].color;
			if(color === undefined || color == null) {
				sm[room_id + '.' + ctrl_id] = state;
			} else {
				if(sm[room_id + '.' + ctrl_id] === undefined) {
					sm[room_id + '.' + ctrl_id] = new Map();
				}
				sm[room_id + '.' + ctrl_id].state = state;
				sm[room_id + '.' + ctrl_id].color = color;
			}
		}
	}
	return(JSON.stringify(sm));
}

function servedynamic(req, res) {
	const parts = req.url.split('/');
	if(parts[2] === 'ctrl') {
		const payload = parts[3].split('?');
		const ctrl = payload[0].split('_');
        relayCmd(ctrl[1], ctrl[2], payload[1]);
		res.writeHead(204);
		res.end();
	} else if(parts[2].startsWith("upnp=")) {
		if(parts[2].endsWith("=off")) hbe.stopUPNP();
		else if(parts[2].endsWith("=on")) hbe.startUPNP();
		res.writeHead(204);
		res.end();
	} else if(parts[2] === 'statemap.json') {
		res.writeHead(200, {'Content-Type': 'application/json'});
		res.write(generateStateMap(model));
		res.end();
	} else if(parts[2] === 'fullmap.json') {
		res.writeHead(200, {'Content-Type': 'application/json'});
		res.write(JSON.stringify(model));
		res.end();
	} else {
		logMessage("WARN", "servDynamic: Unknown request " + req.url);
		res.writeHead(404, {'Content-Type': 'text/html'});
		res.write("<html><head><title>Not Found!</title></head><body><h1>Page Not Found!</h1></body></html>");
		res.end();
	}
}

function hueCallback(hbe, id, light, state) {
    const ctrl = model.rooms[hueMap[id].room].ctrls[hueMap[id].ctrl];
    if(!ctrl) return;

    logMessage("DEBUG", `Hue Callback on ${ctrl.name} with ${JSON.stringify(state, 1)}`);
    const ctrlstate = {};
    const powerstate = (state.on !== undefined) ? state.on : light.state.on;
    ctrlstate.state = (powerstate == true) ? "1" : "0";
    if(powerstate == true  && ctrl.type == "SMARTLIGHT" &&
    	(state.ct !== undefined || state.hue != undefined || state.sat !== undefined || state.bri !== undefined)) {
        let colormode = true;
        if(state.ct  !== undefined ||
            (state.hue === undefined && state.sat === undefined &&
                light.state.colormode == "ct")) colormode = false;

        const bri = (state.bri !== undefined) ? state.bri : light.state.bri;
        if(colormode) {
            light.state.colormode = "hs";
            const hue = (state.hue !== undefined) ? state.hue : light.state.hue;
            const sat = (state.sat !== undefined) ? state.sat : light.state.sat;
            ctrlstate.hsb = [ Math.round(state.hue / 182), sat, bri ];
        } else {
            light.state.colormode = "ct";
            ctrlstate.ct = [ Math.round(bri * 100 / 254), (state.ct) ? state.ct : light.state.ct ];
        }
    }
    hbe.setState(id, state);
    logMessage("DEBUG", `Setting ${ctrl.name} to ${JSON.stringify(ctrlstate, 1)}`);
    relayCmd(hueMap[id].room, hueMap[id].ctrl, ctrlstate);
}

const hbe = new HueBridgeEmulator({ port: hueport, debug: true, upnp: false, devicedb: devdb, callback: hueCallback });
hueSetup(hbe, model, hueMap);
hbe.start();
initControlRead(model);

var server = http.createServer((req, res) => {
	// console.log(req.url);
    if(req.url.startsWith('/dynamic/')) {
		servedynamic(req, res);
	} else {
		servestatic(req, res);
	}
});
server.listen(port);
