'use strict';
const util = require('hcutils');
// const HouseModel = require("housemodel");

class TasmotaHandler {
    constructor() {
        this.pollInterval = 5000;
        this.ctrlmap = {};
    }

    relayCmd(ctrl, key, value) {
        let cmdstr = '';
        if(key === 'value' || key === 'state') {
            util.logMessage("INFO", `TasmotaHandler::relayCmd(): Turning ${(value === "1")?"on":"off"} ${ctrl.fullname}`);
            // cmdstr = '/cm?cmnd=POWER0%20' + value;
            cmdstr = ctrl.channel ? `/cm?cmnd=POWER${ctrl.channel}%20${value}` : `/cm?cmnd=POWER0%20${value}`;
        } else if(key === 'color') {
            util.logMessage("INFO", `TasmotaHandler::relayCmd(): Setting ${ctrl.fullname} color to ${value}`);
            cmdstr = '/cm?cmnd=Color%20' + value;
        } else if(key === 'hsb') {
            util.logMessage("INFO", `Setting ${$ctrl.fullname} HSB Color to ${value[0]},${value[1]},${value[2]}`);
            cmdstr = `/cm?cmnd=HSBColor%20${value[0]},${value[1]},${value[2]}`;
        } else if(key === 'ct') {
            util.logMessage("INFO", `Setting ${ctrl.fullname} CT to ${value[0]},${value[1]}`);
            cmdstr = `/cm?cmnd=Backlog%20White%20${value[0]}%20CT%20${value[1]}`;
        } else if(key === 'level') {
            util.logMessage("INFO", `TasmotaHandler::relayCmd(): Setting ${ctrl.fullname} level to ${value}`);
            cmdstr = ctrl.channel ? `/cm?cmnd=Channel${ctrl.channel}%20${value}` : `/cm?cmnd=Dimmer%20${value}`;
        } else {
            util.logMessage("WARN", `TasmotaHandler::relayCmd(): Dropped unknown Command ${cmd} to ${ctrl.fullname}`);
            return;
        }
        util.doRemoteCmd(ctrl.host, 80, cmdstr).catch((e) => {
            util.logMessage("WARN", `TasmotaHandler::relayCmd(): ${e.message} for ${ctrl.fullname}`);
        });
    }

    registerControl(ctrl, callback) {
        const host = ctrl.host;
        if(!host) return;
        if(this.ctrlmap[host]) {

            this.ctrlmap[host].push({ ctrl: ctrl, callback: callback });
            util.logMessage("INFO", `TasmotaHandler::registerControl(): ${ctrl.fullname} added to ${ctrl.host}`);
        } else {
            this.ctrlmap[host] = [];
            this.ctrlmap[host].push({ ctrl: ctrl, callback: callback });
            util.logMessage("INFO", `TasmotaHandler::registerControl(): ${ctrl.fullname} set for ${ctrl.host}`);
            setInterval(this._loadState, this.pollInterval, this.ctrlmap, host);
        }
    }

    _loadState(ctrlmap, host) {
        util.doRemoteCmd(host, 80, '/cm?cmnd=Status%2011').then((data) => {
            try {
                const info = JSON.parse(data);
                ctrlmap[host].forEach((tuple) => {
                    const statemap = {};
                    const channel = tuple.ctrl.channel;
                    const state = channel ? info.StatusSTS[`POWER${channel}`] : info.StatusSTS.POWER;
                    if (state) statemap["state"] = state.toLowerCase();
                    let ctrltype = tuple.ctrl.subtype;
                    if(!ctrltype && tuple.ctrl.type === "SMARTLIGHT") ctrltype = "RGBWW";
                    switch(ctrltype) {
                        case "RGBWW":
                        case "RGB":
                            if(info.StatusSTS.Color !== undefined) statemap["color"] = info.StatusSTS.Color;
                            if(info.StatusSTS.HSBColor !== undefined) statemap["hsb"] = info.StatusSTS.HSBColor;
                            if(info.StatusSTS.White !== undefined) statemap["white"] = info.StatusSTS.White;
                            if(info.StatusSTS.CT !== undefined) statemap["ct"] = info.StatusSTS.CT;
                            break;
                        case "DIMMER":
                            statemap["level"] = channel ? info.StatusSTS[`Channel${channel}`] : info.StatusSTS.Dimmer;
                            break;
                        default:
                            break;
                    }
                    tuple.callback(tuple.ctrl, statemap);
                });
            } catch(e) {
                util.logMessage("WARN", `TasmotaHandler::loadState: ${e.message} for (${host})`);
            }
        }, (e) => { 
            if(e.code === 'EHOSTUNREACH') {
                // host offline.
                ctrlmap[host].forEach((tuple) => {
                    if(tuple.ctrl.state !== "offline") {
                        util.logMessage("WARN", `TasmotaHandler::loadState: ${e.message} for ${tuple.ctrl.fullname} (${host})`);
                        tuple.callback(tuple.ctrl, { "state": "offline" });
                    }
                });
            } else util.logMessage("WARN", `TasmotaHandler::loadState: ${e.message} for (${host})`);
        });
        return false;
    }
}

module.exports = TasmotaHandler;
