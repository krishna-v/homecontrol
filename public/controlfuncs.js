window.onload = initApp;

const popupmap = {
	"smartlight": openSmartLightPopup
};

function initApp() {
	var xhttp = new XMLHttpRequest();
	xhttp.onreadystatechange = function() {
		if(this.readyState == 4 && this.status == 200) {
			loadUI(JSON.parse(this.responseText));
		}
	};
	var url = "/model.json";
	xhttp.open("GET", url, true);
	xhttp.send();
	// buildSmartLightPopup();
}

function loadUI(model) {
	var wrapper = document.getElementById("appwrapper");
	var homebox = document.getElementById("home");
	var logo = document.getElementById("logo");
	var menubox = document.getElementById("menubox");
	logo.onclick = function() { showUI("home"); };
	menubox.onclick = function() { showUI("activectrls"); };

	for(var room_id in model.rooms) {
		console.log("Building room " + room_id);
		var roombox = document.createElement("div");
		roombox.id = "roombox_" + room_id;
		roombox.setAttribute("class", "roombox");
		var roombtn = document.createElement("button");
		roombtn.id = "roomlink_" + room_id;
		roombtn.setAttribute("class", "roomlink");
		roombtn.setAttribute("room_id", "room_" + room_id);
		roombtn.onclick = function() { showUI(this.getAttribute("room_id")); };
		roombtn.innerHTML = model.rooms[room_id].name;
		roombox.appendChild(roombtn);
		homebox.appendChild(roombox);
		var room = createroom(room_id, model.rooms[room_id]);
		appwrapper.appendChild(room);
	}
	updateStateNew();
	showUI("home");
}

function createroom(room_id, rinfo) {
	var active = document.getElementById("activectrls");
	var room = document.createElement("div");
	room.id = "room_" + room_id;
	room.setAttribute("class", "container room");
	room.setAttribute("name", rinfo.name);
	room.setAttribute("num", room_id);
	room.setAttribute("state", "hidden");
	for(var ctrl_id in rinfo.ctrls) {
		var ctrl = rinfo.ctrls[ctrl_id];
		var control = document.createElement("div");
		control.id = "ctrl_div_" + room_id + "_" + ctrl_id;
		control.setAttribute("class", "control");
		control.setAttribute("type", ctrl.type);

		var dup_div = control.cloneNode(false);
		dup_div.id = "act_dup_div_" + room_id + "_" + ctrl_id;
		dup_div.setAttribute("childstate", "off");

		var btn = document.createElement("button");
		btn.id = "ctrl_" + room_id + "_" + ctrl_id;
		btn.setAttribute("name", btn.id);
		btn.setAttribute("class", ctrl.type.toLowerCase());
		btn.setAttribute("state", "offline");
		btn.onclick = function() { flip_state(this); };
		btn.innerHTML = ctrl.name;

		var dup_ctrl = btn.cloneNode(false);
		dup_ctrl.id = "act_dup_" + btn.id;
		var clsname = btn.getAttribute("class") + " dup_" + btn.id;
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
	var list = document.getElementsByClassName("container");
	for(var i = 0; i < list.length; i++) {
		list[i].setAttribute("state", "hidden");
	}
	var active = document.getElementById(name);
	active.setAttribute("state", "active");
	document.getElementById("pagetitle").innerHTML = active.getAttribute("name");
}

var reload = setInterval(updateStateNew, 10000);

function updatestate() {
	var xhttp = new XMLHttpRequest();
	xhttp.onreadystatechange = function() {
		if(this.readyState == 4 && this.status == 200) {
			refreshstate(JSON.parse(this.responseText));
		}
	};
	var url = "/dynamic/statemap.json";
	xhttp.open("GET", url, true);
	xhttp.send();
}

function updateStateNew() {
	var xhttp = new XMLHttpRequest();
	xhttp.onreadystatechange = function() {
		if(this.readyState == 4 && this.status == 200) {
			refreshStateNew(JSON.parse(this.responseText));
		}
	};
	var url = "/dynamic/fullmap.json";
	xhttp.open("GET", url, true);
	xhttp.send();
}

function set_state(ctrl, value) {
	var name = ctrl.getAttribute("name");
	var realctrl = document.getElementById(name);
	var query="/dynamic/ctrl/" + name + "?value=" + value;
	console.log("flip_state: query = " + query);
	var xhttp = new XMLHttpRequest();
	xhttp.onreadystatechange = function() {
		if(this.readyState == 4) {
			if(this.status == 200 || this.status == 204) {
				realctrl.setAttribute("pending", "true");
				realctrl.setAttribute("pendcount", 0);
				var state = value == 1 ? "on" : "off";
				realctrl.setAttribute("state", state);
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

function set_color(ctrl, color) {
	var name = ctrl.getAttribute("name");
	var realctrl = document.getElementById(name);
	var query="/dynamic/ctrl/" + name + "?color=" + color;
	var xhttp = new XMLHttpRequest();
	xhttp.onreadystatechange = function() {
		if(this.readyState == 4) {
			if(this.status == 200 || this.status == 204) {
				let state = "on";
				realctrl.setAttribute("pending", "true");
				realctrl.setAttribute("pendcount", 0);
				realctrl.setAttribute("state", state);
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
	var newval = ctrl.getAttribute('state') == "on" ? 0 : 1;
	set_state(ctrl, newval);
}

function refreshstate(data) {
	console.log("Refresh State (old)...");
	for(var key in data) {
		var arr = key.split(".");
		var room_id = arr[0];
		var ctrl_id = arr[1];
		var value = data[key];;
		var state;
		var color = null;
		if(typeof value == "string") {
			state = value;
		} else {
			state = value.state;
			color = value.color;
		}
		var node = document.getElementById("ctrl_" + room_id + "_" + ctrl_id);
		if(node) {
			var nodestate = node.getAttribute("state");
			if(color != null) {
				node.setAttribute("lightcolor", color);
			}
			if(state != nodestate) {
				var pending = node.getAttribute("pending");
				var pendcount = node.getAttribute("pendcount");
				if(pending == "true") {
					console.log(node.id + ": state mismatch. pc: " + pendcount);
					if(pendcount < 2) {
						node.setAttribute("pendcount", parseInt(pendcount) + 1);
						continue;
					}
				}
				node.setAttribute("state", state);
				update_dups(node);
			}
			node.setAttribute("pending", "false");
			node.setAttribute("pendcount", "0");
		} else {
			console.log("Can't find node. room_id: " + room_id + ", control ID: " + ctrl_id);
		}
	}
}

function refreshStateNew(data) {
	let now = Date.now();
	for(var room_id in data.rooms) {
		for(var ctrl_id in data.rooms[room_id].ctrls) {
			var state = data.rooms[room_id].ctrls[ctrl_id].state;
			if(state === undefined || state == null) continue;
			var color = data.rooms[room_id].ctrls[ctrl_id].color;
			var lastchanged = data.rooms[room_id].ctrls[ctrl_id].lastChanged;
			var node = document.getElementById("ctrl_" + room_id + "_" + ctrl_id);
			if(node) {
				let needs_update = false;
				var nodestate = node.getAttribute("state");
				if(color != null) {
					node.setAttribute("lightcolor", color);
				}
				if(state != nodestate) {
					var pending = node.getAttribute("pending");
					var pendcount = node.getAttribute("pendcount");
					if(pending == "true") {
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
				if(lastchanged !== undefined && lastchanged != null) {
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
	var state = node.getAttribute("state");
	var color = node.getAttribute("lightcolor");
	var lastchanged = node.getAttribute("lastchanged");
	var ontime = node.getAttribute("ontime");

	// console.log("updating dups..." + node.getAttribute("name"));
	var dupname = "dup_" + node.id;
	var duplist = document.getElementsByClassName(dupname);
	for(var i = 0; i < duplist.length; i++) {
		duplist[i].setAttribute("state", state);
		if(color !== undefined && color != null) duplist[i].setAttribute("lightcolor", color);
		if(lastchanged !== undefined && lastchanged != null) duplist[i].setAttribute("lastchanged", lastchanged);
		if(ontime !== undefined && ontime != null) duplist[i].setAttribute("ontime", ontime);
		duplist[i].parentNode.setAttribute("childstate", state == "offline" ? "off" : state);
	}
}

/* ----------------- Popup Stuff -------------------------------*/

function buildSmartlightTopBox() {
	var topbox = document.createElement("div");
	topbox.id = name + "top-ctrls";	
	topbox.setAttribute("class", "smartlight-topbox");

	var lightmode = document.createElement("div");
	lightmode.id = "lightmode";
	lightmode.setAttribute("class", "popup-label");
	lightmode.innerHTML = "Light Mode:";
	topbox.appendChild(lightmode);

	var switchwrap = document.createElement("div");
	switchwrap.id = "switchwrap";
	switchwrap.setAttribute("class", "flexwrap");

	var switchlabel = document.createElement("label");
	switchlabel.id = "top-switchlabel";
	switchlabel.setAttribute("class", "switch");

	var modetoggle = document.createElement("input");
	modetoggle.id = "modeToggle";
	modetoggle.setAttribute("type", "checkbox");
	modetoggle.onclick = function() { togglemode(this); };
	switchlabel.appendChild(modetoggle);

	var opmodediv = document.createElement("div");
	opmodediv.id = "opmode";
	opmodediv.setAttribute("class", "toggle opmode");
	switchlabel.appendChild(opmodediv);
	switchwrap.appendChild(switchlabel);
	topbox.appendChild(switchwrap);

	var applywrap = document.createElement("div");
	applywrap.id = "applywrap";
	applywrap.setAttribute("class", "flexwrap");

	var applybutton = document.createElement("button");
	applybutton.id = "apply";
	applybutton.onclick = function() { execPopup(); };
	applybutton.innerHTML = "Apply!";
	applywrap.appendChild(applybutton);
	topbox.appendChild(applywrap);

	return topbox;
}

function sliderChanged(slider) {
	let val = slider.parentElement.parentElement.querySelector(".slider-value");
	if(val !== undefined && val !== null) val.innerHTML = slider.value;
	else console.log("Can't find the value box for " + slider.id);
}

function buildSlider(name, label, min, max, start) {
	var sliderbox = document.createElement("div");
	sliderbox.id = name + "-box";	
	sliderbox.setAttribute("class", "sliderbox");
	sliderbox.setAttribute("state", "hidden");

	var labeldiv = document.createElement("div");
	labeldiv.id = name + "-label";
	labeldiv.setAttribute("class", "popup-label");
	labeldiv.innerHTML = label;
	sliderbox.appendChild(labeldiv);

	var rangediv = document.createElement("div");
	rangediv.id = name + "-slider";
	rangediv.setAttribute("class", "slider-wrap");

	var range = document.createElement("input");
	range.id = name + "-range";
	range.setAttribute("type", "range");
	range.setAttribute("class", "range");
	range.setAttribute("min", min);
	range.setAttribute("max", max);
	range.setAttribute("value", start);
	range.oninput = function() { sliderChanged(this); };

	rangediv.appendChild(range);
	sliderbox.appendChild(rangediv);

	var valuebox = document.createElement("div");
	valuebox.id = name + "-value";
	valuebox.setAttribute("class", "slider-value");
	valuebox.innerHTML = start;
	sliderbox.appendChild(valuebox);

	return sliderbox;
}

function buildInfoBox(ctrl) {
	var infobox = document.createElement("div");
	infobox.id = "popup-infobox";
	infobox.setAttribute("class", "popup-infobox");
	let changets = ctrl.getAttribute("lastchanged");
	let lastchanged = "unknown";
	if(changets !== undefined || changets != null) {
		console.log("Lastchanged: " + changets);
		try {
			lastchanged = new Date(Number(changets)).toLocaleString('sv', { timeZone: 'Asia/Kolkata' });
			if(lastchanged.toString() == "Invalid Date") throw new RangeError("Invalid Date");
		} catch(e) {
			lastchanged = "{ " + new Date(Number(changets)).toLocaleString( 'sv', { timeZoneName: 'short' } ).replace(/ GMT.*/, "") + " }";
		}
	}
	infobox.innerHTML = ctrl.getAttribute("state").toUpperCase() + " since " + lastchanged;
	return infobox;
}

function buildSmartLightPopup(ctrl) {
	var content = document.getElementById("popupcontent");
	content.appendChild(buildSmartlightTopBox());
	content.appendChild(buildSlider("ctemp", "White/Yellow :", 0, 100, 100));
	content.appendChild(buildSlider("lum", "Brightness :", 0, 255, 128));
	content.appendChild(buildSlider("red", "Red :", 0, 255, 175));
	content.appendChild(buildSlider("green", "Green :", 0, 255, 175));
	content.appendChild(buildSlider("blue", "Blue :", 0, 255, 175));
	content.appendChild(buildInfoBox(ctrl));
}

function openPopup(ctrl) {
	var name = ctrl.getAttribute("name");
	var realctrl = document.getElementById(name);
	
	let ctrltype = realctrl.getAttribute("class");
	console.log("Getting popup func for type " + ctrltype);
	let popupFunc = popupmap[realctrl.getAttribute("class")];
	if(popupFunc === undefined || popupFunc == null) popupFunc = openInfoPopup;
	document.getElementById("popup-title").innerHTML = realctrl.innerHTML;
	var content = document.getElementById("popupcontent");
	while(content.firstChild) { content.removeChild(content.firstChild); }
	popupFunc(realctrl);

	var popup = document.getElementById("ctrl-popup");
	popup.setAttribute("ctrl_id", ctrl.id);
	popup.setAttribute("state", "active");
	event.preventDefault();
	return false;
}

function openInfoPopup(ctrl) {
	console.log("openInfoPopup called");
	var content = document.getElementById("popupcontent");
	content.appendChild(buildInfoBox(ctrl));
}

function openSmartLightPopup(ctrl) {
	buildSmartLightPopup(ctrl);
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
		togglemode(modetoggle);
	}
};

function closePopup() {
	document.getElementById("ctrl-popup").setAttribute("state", "hidden");
};

function togglemode(cb) {
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
};

function execPopup() {
	var r = 0, g = 0, b = 0, cw = 0, ww = 0, hexcolor="";
	if(document.getElementById("modeToggle").checked) {
		var temp = document.getElementById("ctemp-range").value;
		var lum = document.getElementById("lum-range").value;
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
	var ctrl_id = document.getElementById("ctrl-popup").getAttribute("ctrl_id");
	var ctrl = document.getElementById(ctrl_id);
	set_color(ctrl, hexcolor);
}
