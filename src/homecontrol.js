'use strict';

const http = require('http'); // import { get, createServer } from 'http';
const statsrv = require('node-static'); // import { Server } from 'node-static';
const { nextTick } = require('process');
const util = require('hcutils');

const basepath = process.env.HOMECONTROL ? process.env.HOMECONTROL : '/usr/local/share/homecontrol';
const documentroot = basepath + '/public';

// Point HBEPath to the location of hue-bridge-emulator
const HBEPath = process.env.HUEBRIDGE ? process.env.HUEBRIDGE : '/usr/local/share/hue-bridge-emulator';
const HueBridgeEmulator = require('hue-bridge-emulator');
const HouseModel = require('housemodel');
const devdb = HBEPath + '/devicedb';

// Port on which the Web UI runs. Hue Emulator runs on 80 so this must be different.
const port = process.env.HOMECONTROL_PORT ? process.env.HOMECONTROL_PORT : 8080;
// hue-bridge-emulator runs on this port (Has to be 80 for Alexa integration.)
const hueport = 80;
// -------------------------------------------------------------------------

const protocols = {};
const hueMap = {};
var model = new HouseModel(documentroot + '/model.json');
const file = new statsrv.Server(documentroot);

function servestatic(req,res) {
	file.serve(req, res);
}

function relayCmd(room_id, ctrl_id, state_info) {
    const protocol = model.control(room_id, ctrl_id).protocol;
    if(typeof state_info === "string") {
        const parts = state_info.split('=');
		protocols[protocol].relayCmd(model, room_id, ctrl_id, parts[0], parts[1]);
    } else {
        for(let key in state_info)
			protocols[protocol].relayCmd(model, room_id, ctrl_id, key, state_info[key]);
    }
}

function updateState(model, room_id, ctrl_id) {
	const ctrl = model.control(room_id, ctrl_id);
	if(!protocols[ctrl.protocol].loadState(model, room_id, ctrl_id)) return;
	if(ctrl.state === "offline") {
		hbe.setState(model.control(room, ctrl).hueid, { reachable: false });
		return;
	}
	const hueState = {};
	hueState.reachable = true;
	hueState.on = (ctrl.state === "on");
	if(ctrl.hsb !== undefined) {
		const hsb = ctrl.hsb.split(',').map(x => parseInt(x));
		if(hsb[2] === 0) {
			hueState.colormode = "ct";
			const white = ctrl.white === undefined ? 100 : ctrl.white;
			hueState.bri = Math.round(white * 254 / 100);
		} else {
			hueState.colormode = "hs";
			hueState.hue = hsb[0] * 182;
			hueState.sat = hsb[1];
			hueState.bri = hsb[2];
		}
	}
	hbe.setState(ctrl.hueid, hueState);
}

function initControlRead() {
	for(let room_id in model.rooms) {
		for(let ctrl_id in model.room(room_id).ctrls) {
			const protocol = model.control(room_id, ctrl_id).protocol;
			if(protocol === undefined || protocol === 'none') {
				util.logMessage("INFO", `skipping ${room_id}:${ctrl_id} with protocol ${protocol}`);
				continue;
			}
			if(protocols[protocol] === undefined) {
				try {
					protocols[protocol] = new (require(`protocols/${protocol}-handler`))();
				} catch(e) {
					util.logMessage("WARN", `Error loading handler for ${protocol}, skipping ${room_id}:${ctrl_id}. ${e.message}`);
					continue;
				}
			}
			setInterval(updateState, 5000, model, room_id, ctrl_id);
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
            lightspec.model = (type === "SMARTLIGHT") ? "LCT016" : "LOM001";
            lightspec.override = { uniqueid: `00:17:88:01:${room.padStart(2,'0')}:${ctrl.padStart(2,'0')}:01:01-0b` }
			// TODO: Fix so that hueid can be non-sequential and set in the model.
            const hueid = hbe.addDevice(lightspec);
			m.rooms[room].ctrls[ctrl].hueid = hueid;
            huemap[hueid] = { "room": room, "ctrl": ctrl };
		}
	}
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
	} else if(parts[2] === 'fullmap.json') {
        res.writeHead(200, {
            'Content-Type': 'application/json',
            'Cache-Control': 'no-store, no-cache, must-revalidate',
            'Pragma': 'no-cache',
            'Expires': 0,
            'Surrogate-Control': 'no-store'
        });
		res.write(JSON.stringify(model));
		res.end();
	} else {
		util.logMessage("WARN", "servDynamic: Unknown request " + req.url);
		res.writeHead(404, {'Content-Type': 'text/html'});
		res.write("<html><head><title>Not Found!</title></head><body><h1>Page Not Found!</h1></body></html>");
		res.end();
	}
}

function hueCallback(hbe, id, light, state) {
    const ctrl = model.rooms[hueMap[id].room].ctrls[hueMap[id].ctrl];
    if(!ctrl) return;

    util.logMessage("DEBUG", `Hue Callback on ${ctrl.name} with ${JSON.stringify(state, 1)}`);
    const ctrlstate = {};
    const powerstate = (state.on !== undefined) ? state.on : light.state.on;
    ctrlstate.state = (powerstate === true) ? "1" : "0";
    if(powerstate === true  && ctrl.type === "SMARTLIGHT" &&
    	(state.ct !== undefined || state.hue != undefined || state.sat !== undefined || state.bri !== undefined)) {
        let colormode = true;
        if(state.ct  !== undefined ||
            (state.hue === undefined && state.sat === undefined &&
                light.state.colormode === "ct")) colormode = false;

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
    util.logMessage("DEBUG", `Setting ${ctrl.name} to ${JSON.stringify(ctrlstate, 1)}`);
    relayCmd(hueMap[id].room, hueMap[id].ctrl, ctrlstate);
}

const hbe = new HueBridgeEmulator({ port: hueport, debug: true, upnp: false, devicedb: devdb, callback: hueCallback });
hueSetup(hbe, model, hueMap);
hbe.start();
initControlRead();

var server = http.createServer((req, res) => {
	// console.log(req.url);
    if(req.url.startsWith('/dynamic/')) {
		servedynamic(req, res);
	} else {
		servestatic(req, res);
	}
});
server.listen(port);
