window.onload = loadURL("/model.json", loadUI);

const popupmap = {
	"smartlight": openRGBWWPopup,
	"dimmer": openDimmerPopup
};

function loadURL(url, callback) {
	const xhttp = new XMLHttpRequest();
	xhttp.onreadystatechange = function() {
		if(this.readyState == 4 && this.status == 200) {
			callback(JSON.parse(this.responseText));
		}
	};
	xhttp.open("GET", url, true);
	xhttp.send();
}

function loadUI(model) {
	const wrapper = document.getElementById("appwrapper");
	const homebox = document.getElementById("home");
	const logo = document.getElementById("logo");
	const menubox = document.getElementById("menubox");
	logo.onclick = function() { showUI("home"); };
	menubox.onclick = function() { showUI("activectrls"); };

	for(let room_id in model.rooms) {
		console.log("Building room " + room_id);
		const roombox = document.createElement("div");
		roombox.id = "roombox_" + room_id;
		roombox.setAttribute("class", "roombox");
		const roombtn = document.createElement("button");
		roombtn.id = "roomlink_" + room_id;
		roombtn.setAttribute("class", "roomlink");
		roombtn.setAttribute("room_id", "room_" + room_id);
		roombtn.onclick = function() { showUI(this.getAttribute("room_id")); };
		roombtn.innerHTML = model.rooms[room_id].name;
		roombox.appendChild(roombtn);
		homebox.appendChild(roombox);
		const room = createroom(room_id, model.rooms[room_id]);
		wrapper.appendChild(room);
	}
	loadURL("/dynamic/fullmap.json", refreshState);
	showUI("home");
}

function createroom(room_id, rinfo) {
	const active = document.getElementById("activectrls");
	const room = document.createElement("div");
	room.id = "room_" + room_id;
	room.setAttribute("class", "container room");
	room.setAttribute("name", rinfo.name);
	room.setAttribute("num", room_id);
	room.setAttribute("state", "hidden");
	for(let ctrl_id in rinfo.ctrls) {
		const ctrl = rinfo.ctrls[ctrl_id];
		const control = document.createElement("div");
		control.id = "ctrl_div_" + room_id + "_" + ctrl_id;
		control.setAttribute("class", "control");
		control.setAttribute("type", ctrl.type);

		const dup_div = control.cloneNode(false);
		dup_div.id = "act_dup_div_" + room_id + "_" + ctrl_id;
		dup_div.setAttribute("childstate", "off");

		const btn = document.createElement("button");
		btn.id = "ctrl_" + room_id + "_" + ctrl_id;
		btn.setAttribute("name", btn.id);
		btn.setAttribute("class", ctrl.type.toLowerCase());
		if(ctrl.subtype !== undefined) btn.setAttribute("subtype", ctrl.subtype.toLowerCase());
		btn.setAttribute("state", "offline");
		btn.onclick = function() { flip_state(this); };
		btn.innerHTML = ctrl.name;

		const dup_ctrl = btn.cloneNode(false);
		dup_ctrl.id = "act_dup_" + btn.id;
		const clsname = btn.getAttribute("class") + " dup_" + btn.id;
		dup_ctrl.setAttribute("class", clsname);
		dup_ctrl.onclick = function() { flip_state(this); };
		btn.oncontextmenu = function() { openPopup(this); };
		dup_ctrl.oncontextmenu = function() { openPopup(this); };
		dup_ctrl.innerHTML = rinfo.name + "<br />" + ctrl.name;

		control.appendChild(btn);
		room.appendChild(control);
		dup_div.appendChild(dup_ctrl);
		active.appendChild(dup_div);
	}
	return room;
}

function showUI(name) {
	console.log("showUI : " + name);
	const list = document.getElementsByClassName("container");
	for(let i = 0; i < list.length; i++) {
		list[i].setAttribute("state", "hidden");
	}
	const active = document.getElementById(name);
	active.setAttribute("state", "active");
	document.getElementById("pagetitle").innerHTML = active.getAttribute("name");
}

var reload = setInterval(loadURL, 10000, "/dynamic/fullmap.json", refreshState);

function setCtrlState(ctrl, key, value) {
	const name = ctrl.getAttribute("name");
	const realctrl = document.getElementById(name);
	const query=`/dynamic/ctrl/${name}?${key}=${value}`;
	console.log(`setCtrlState: ${query}`)
	const xhttp = new XMLHttpRequest();
	xhttp.onreadystatechange = function() {
		if(this.readyState == 4) {
			if(this.status == 200 || this.status == 204) {
				realctrl.setAttribute("pending", "true");
				realctrl.setAttribute("pendcount", 0);
				if(key == "value") realctrl.setAttribute("state", (value === 1) ? "on" : "off");
				else realctrl.setAttribute("state", "on");
				update_dups(realctrl);
			}
			else if (this.status == 404) {
				console.log(responseText);
			}
		}
	};
	xhttp.open("GET", query, true);
	xhttp.send();
}

function flip_state(ctrl) {
	const newval = ctrl.getAttribute('state') === "on" ? 0 : 1;
	setCtrlState(ctrl, "value", newval);
}

function refreshState(data) {
	let now = Date.now();
	for(let room_id in data.rooms) {
		for(let ctrl_id in data.rooms[room_id].ctrls) {
			const state = data.rooms[room_id].ctrls[ctrl_id].state;
			if(state === undefined || state == null) continue;
			const color = data.rooms[room_id].ctrls[ctrl_id].color;
			const level = data.rooms[room_id].ctrls[ctrl_id].level;
			let lastchanged = data.rooms[room_id].ctrls[ctrl_id].lastChanged;
			const node = document.getElementById("ctrl_" + room_id + "_" + ctrl_id);
			if(node) {
				let needs_update = false;
				const nodestate = node.getAttribute("state");
				if(color !== null) node.setAttribute("lightcolor", color);
				if(level !== null) node.setAttribute("level", level);
				if(state !== nodestate) {
					const pending = node.getAttribute("pending");
					const pendcount = node.getAttribute("pendcount");
					if(pending === "true") {
						console.log(node.id + ": state mismatch. pc: " + pendcount);
						if(pendcount < 2) {
							node.setAttribute("pendcount", parseInt(pendcount) + 1);
							continue;
						}
					}
					node.setAttribute("state", state);
					node.removeAttribute("ontime");
					needs_update = true;
				}
				node.setAttribute("pending", "false");
				node.setAttribute("pendcount", "0");
				if(lastchanged !== undefined && lastchanged !== null) {
					node.setAttribute("lastchanged", lastchanged);
					lastchanged = Number(lastchanged);
					if(state == "on" && (now - lastchanged) > 7200000 &&
						!node.hasAttribute("ontime")) {
						node.setAttribute("ontime", "long");
						console.log(node.name + "is on for a long time!");
						needs_update = true;
					}
				}
				if(needs_update) update_dups(node);
			} else {
				console.log("Can't find node. room_id: " + room_id + ", control ID: " + ctrl_id);
			}
		}
	}
}

function update_dups(node) {
	const state = node.getAttribute("state");
	const color = node.getAttribute("lightcolor");
	const lastchanged = node.getAttribute("lastchanged");
	const ontime = node.getAttribute("ontime");

	// console.log("updating dups..." + node.getAttribute("name"));
	const dupname = "dup_" + node.id;
	const duplist = document.getElementsByClassName(dupname);
	for(let i = 0; i < duplist.length; i++) {
		duplist[i].setAttribute("state", state);
		if(color !== undefined && color != null) duplist[i].setAttribute("lightcolor", color);
		if(lastchanged !== undefined && lastchanged !== null) duplist[i].setAttribute("lastchanged", lastchanged);
		if(ontime !== undefined && ontime !== null) duplist[i].setAttribute("ontime", ontime);
		duplist[i].parentNode.setAttribute("childstate", state == "offline" ? "off" : state);
	}
}

/* ----------------- Popup Stuff -------------------------------*/

function openPopup(ctrl) {
	const name = ctrl.getAttribute("name");
	const realctrl = document.getElementById(name);
	const subtype = realctrl.getAttribute("subtype");
	const ctrltype = (subtype === undefined || subtype === null) ? realctrl.getAttribute("class") : subtype;
	console.log(`Getting popup func for type ${ctrltype}`);
	let popupFunc = popupmap[ctrltype];
	if(popupFunc === undefined || popupFunc == null) popupFunc = openInfoPopup;
	document.getElementById("popup-title").innerHTML = realctrl.innerHTML;
	const content = document.getElementById("popupcontent");
	while(content.firstChild) { content.removeChild(content.firstChild); }
	popupFunc(realctrl);

	const popup = document.getElementById("ctrl-popup");
	popup.setAttribute("ctrl_id", ctrl.id);
	popup.setAttribute("state", "active");
	event.preventDefault();
	return false;
}

function closePopup() {
	document.getElementById("ctrl-popup").setAttribute("state", "hidden");
}

// Standard InfoBox (used in all popups.)
function buildInfoBox(ctrl) {
	const infobox = document.createElement("div");
	infobox.id = "popup-infobox";
	infobox.setAttribute("class", "popup-infobox");
	const changets = ctrl.getAttribute("lastchanged");
	let lastchanged = "unknown";
	if(changets !== undefined || changets != null) {
		console.log("Lastchanged: " + changets);
		try {
			lastchanged = new Date(Number(changets)).toLocaleString('sv', { timeZone: 'Asia/Kolkata' });
			if(lastchanged.toString() === "Invalid Date") throw new RangeError("Invalid Date");
		} catch(e) {
			lastchanged = "{ " + new Date(Number(changets)).toLocaleString( 'sv', { timeZoneName: 'short' } ).replace(/ GMT.*/, "") + " }";
		}
	}
	infobox.innerHTML = ctrl.getAttribute("state").toUpperCase() + " since " + lastchanged;
	return infobox;
}

// Slider Stuff

function sliderChanged(slider) {
	const val = slider.parentElement.parentElement.querySelector(".slider-value");
	if(val !== undefined && val !== null) val.innerHTML = slider.value;
	else console.log("Can't find the value box for " + slider.id);
}

function buildSlider(name, label, min, max, start) {
	const sliderbox = document.createElement("div");
	sliderbox.id = name + "-box";	
	sliderbox.setAttribute("class", "sliderbox");
	sliderbox.setAttribute("state", "hidden");

	const labeldiv = document.createElement("div");
	labeldiv.id = name + "-label";
	labeldiv.setAttribute("class", "popup-label");
	labeldiv.innerHTML = label;
	sliderbox.appendChild(labeldiv);

	const rangediv = document.createElement("div");
	rangediv.id = name + "-slider";
	rangediv.setAttribute("class", "slider-wrap");

	const range = document.createElement("input");
	range.id = name + "-range";
	range.setAttribute("type", "range");
	range.setAttribute("class", "range");
	range.setAttribute("min", min);
	range.setAttribute("max", max);
	range.setAttribute("value", start);
	range.oninput = function() { sliderChanged(this); };

	rangediv.appendChild(range);
	sliderbox.appendChild(rangediv);

	const valuebox = document.createElement("div");
	valuebox.id = name + "-value";
	valuebox.setAttribute("class", "slider-value");
	valuebox.innerHTML = start;
	sliderbox.appendChild(valuebox);

	return sliderbox;
}

// InfoBox Popup (default popup)

function openInfoPopup(ctrl) {
	console.log("openInfoPopup called");
	const content = document.getElementById("popupcontent");
	content.appendChild(buildInfoBox(ctrl));
}


function buildTopBox(minimal, popupType) {
	const topbox = document.createElement("div");
	topbox.id = "top-ctrls";	
	topbox.setAttribute("class", "popup-topbox");

	const lightmode = document.createElement("div");
	lightmode.id = "lightmode";
	lightmode.setAttribute("class", "popup-label popup-element");
	if(!minimal) lightmode.innerHTML = "Light Mode:";
	topbox.appendChild(lightmode);

	const switchwrap = document.createElement("div");
	switchwrap.id = "switchwrap";
	switchwrap.setAttribute("class", "flexwrap popup-element");

	const switchlabel = document.createElement("label");
	switchlabel.id = "top-switchlabel";
	switchlabel.setAttribute("class", "switch");

	if(!minimal) {
		const modetoggle = document.createElement("input");
		modetoggle.id = "modeToggle";
		modetoggle.setAttribute("type", "checkbox");
		modetoggle.onclick = function() { toggleMode(this); };
		switchlabel.appendChild(modetoggle);

		const opmodediv = document.createElement("div");
		opmodediv.id = "opmode";
		opmodediv.setAttribute("class", "toggle opmode");
		switchlabel.appendChild(opmodediv);
	}
	switchwrap.appendChild(switchlabel);
	topbox.appendChild(switchwrap);

	const applywrap = document.createElement("div");
	applywrap.id = "applywrap";
	applywrap.setAttribute("class", "flexwrap");

	const applybutton = document.createElement("button");
	applybutton.id = "apply";
	applybutton.onclick = function() { execPopup(popupType); };
	applybutton.innerHTML = "Apply!";
	applywrap.appendChild(applybutton);
	topbox.appendChild(applywrap);

	return topbox;
}

function execPopup(type) {
	if(type === "dimmer") {
		execDimmerPopup();
	} else if (type === "rgbww") {
		execRGBWWPopup();
	} else {
		console.log(`execPopup(): Unknown type ${type}`);
	}
}

function openDimmerPopup(ctrl) {
	const content = document.getElementById("popupcontent");
	content.appendChild(buildTopBox(true, "dimmer"));
	const label = (ctrl.getAttribute("class") === "fan") ? "Level" : "Brightness";
	const level = ctrl.getAttribute("level");
	const slider = buildSlider("lum", `${label} :`, 1, 100, level === undefined ? 50 : level);
	content.append(slider, buildInfoBox(ctrl));
	slider.setAttribute("state", "active");
	const l = document.getElementById("lum-range");
	l.value = level;
	sliderChanged(l);
}

function execDimmerPopup() {
	const value = document.getElementById("lum-range").value;
	console.log("Setting ctrl level to " + value);
	const ctrl_id = document.getElementById("ctrl-popup").getAttribute("ctrl_id");
	const ctrl = document.getElementById(ctrl_id);
	setCtrlState(ctrl, "level", value);
}

// RGBWW Popup

function buildRGBWWPopup(ctrl) {
	const content = document.getElementById("popupcontent");
	content.appendChild(buildTopBox(false, "rgbww"));
	content.appendChild(buildSlider("ctemp", "White/Yellow :", 0, 100, 100));
	content.appendChild(buildSlider("lum", "Brightness :", 0, 255, 128));
	content.appendChild(buildSlider("red", "Red :", 0, 255, 175));
	content.appendChild(buildSlider("green", "Green :", 0, 255, 175));
	content.appendChild(buildSlider("blue", "Blue :", 0, 255, 175));
	content.appendChild(buildInfoBox(ctrl));
}

function openRGBWWPopup(ctrl) {
	buildRGBWWPopup(ctrl);
	let color = ctrl.getAttribute("lightcolor");
	console.log("Lamp color is " + color);
	if(color !== undefined && color != null) {
		let channels = color.match(/.{1,2}/g);
		let r = document.getElementById("red-range");
		r.value = parseInt(channels[0], 16);
		sliderChanged(r);
		let g = document.getElementById("green-range");
		g.value = parseInt(channels[1], 16);
		sliderChanged(g);
		let b = document.getElementById("blue-range");
		b.value = parseInt(channels[2], 16);
		sliderChanged(b);
		let white = parseInt(channels[3], 16);
		let warm = parseInt(channels[4], 16);
		let lum = white + warm; 
		if(lum > 255) lum = 255;
		let temp = 0;
		let modetoggle = document.getElementById("modeToggle");
		if(white > 0 || warm > 0) {
			temp = warm / lum * 100;
			modeToggle.checked = true;
		} else {
			modeToggle.checked = false;
		}
		let l = document.getElementById("lum-range");
		l.value = lum;
		sliderChanged(l);
		let t = document.getElementById("ctemp-range");
		t.value = temp;
		sliderChanged(t);
		toggleMode(modetoggle);
	}
}

function toggleMode(cb) {
	if(cb.checked) {
		document.getElementById("ctemp-box").setAttribute("state", "active");
		document.getElementById("lum-box").setAttribute("state", "active");
		document.getElementById("red-box").setAttribute("state", "hidden");
		document.getElementById("green-box").setAttribute("state", "hidden");
		document.getElementById("blue-box").setAttribute("state", "hidden");
	} else {
		document.getElementById("ctemp-box").setAttribute("state", "hidden");
		document.getElementById("lum-box").setAttribute("state", "hidden");
		document.getElementById("red-box").setAttribute("state", "active");
		document.getElementById("green-box").setAttribute("state", "active");
		document.getElementById("blue-box").setAttribute("state", "active");
	}
}

function execRGBWWPopup() {
	let r = 0, g = 0, b = 0, cw = 0, ww = 0, hexcolor="";
	if(document.getElementById("modeToggle").checked) {
		const temp = document.getElementById("ctemp-range").value;
		const lum = document.getElementById("lum-range").value;
		cw = Math.round(((100 - temp) / 100) * lum);
		ww = Math.round((temp / 100) * lum);
	} else {
		r = document.getElementById("red-range").value;
		g = document.getElementById("green-range").value;
		b = document.getElementById("blue-range").value;
	}
	hexcolor = (+r).toString(16).padStart(2, '0') +
		(+g).toString(16).padStart(2, '0') +
		(+b).toString(16).padStart(2, '0') +
		(+cw).toString(16).padStart(2, '0') +
		(+ww).toString(16).padStart(2, '0');

	console.log("Setting smart bulb color to " + hexcolor);
	const ctrl_id = document.getElementById("ctrl-popup").getAttribute("ctrl_id");
	const ctrl = document.getElementById(ctrl_id);
	setCtrlState(ctrl, "color", hexcolor);
}
