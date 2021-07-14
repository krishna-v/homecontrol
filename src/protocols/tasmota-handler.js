'use strict';
const util = require('hcutils');
// const HouseModel = require("housemodel");

class TasmotaHandler {

    relayCmd(model, room_id, ctrl_id, key, value) {
        const host = model.control(room_id, ctrl_id).host;	
        const room = model.room(room_id);
        const ctrl = model.control(room_id, ctrl_id);
        const name = room.name + " " + ctrl.name;
        let cmdstr = '';
        if(key === 'value' || key === 'state') {
            util.logMessage("INFO", "TasmotaHandler::relayCmd(): Turning " + ((value === "1") ? "on " : "off ") + name);
            cmdstr = '/cm?cmnd=POWER0%20' + value;
        } else if(key === 'color') {
            util.logMessage("INFO", `TasmotaHandler::relayCmd(): Setting ${name} color to ${value}`);
            cmdstr = '/cm?cmnd=Color%20' + value;
        } else if(key === 'hsb') {
            util.logMessage("INFO", `Setting ${name} HSB Color to ${value[0]},${value[1]},${value[2]}`);
            cmdstr = `/cm?cmnd=HSBColor%20${value[0]},${value[1]},${value[2]}`;
        } else if(key === 'ct') {
            util.logMessage("INFO", `Setting ${name} CT to ${value[0]},${value[1]}`);
            cmdstr = `/cm?cmnd=Backlog%20White%20${value[0]}%20CT%20${value[1]}`;
        } else {
            util.logMessage("WARN", `TasmotaHandler::relayCmd(): Dropped unknown Command ${cmd} to ${name}`);
            return;
        }
        util.doRemoteCmd(host, 80, cmdstr).catch((e) => { util.logMessage("WARN", 'TasmotaHandler::relayCmd(): ' + e.message); });
    }

    loadState(model, room_id, ctrl_id) {
        const ctrl = model.control(room_id, ctrl_id);
        const host = ctrl.host;	
        const statemap = {};
        util.doRemoteCmd(host, 80, '/cm?cmnd=Status%2011').then((data) => {
            try {
                const info = JSON.parse(data);
                const state = info.StatusSTS.POWER.toLowerCase();
                statemap["state"] = state;
                if(info.StatusSTS.Color !== undefined) statemap["color"] = info.StatusSTS.Color;
                if(info.StatusSTS.HSBColor !== undefined) statemap["hsb"] = info.StatusSTS.HSBColor;
                if(info.StatusSTS.White !== undefined) statemap["white"] = info.StatusSTS.White;
                if(info.StatusSTS.CT !== undefined) statemap["ct"] = info.StatusSTS.CT;
                return model.setControlState(room_id, ctrl_id, statemap);
            } catch(e) {
                util.logMessage("WARN", 'loadTasmotaState: ' + e.message + ' for ' + host);
            }
        }, (e) => { 
            if(e.code === 'EHOSTUNREACH') {
                // host offline.
                if(ctrl.state !== "offline") {
                    util.logMessage("WARN", 'loadTasmotaState: ' + e.message + ' for ' + host);
                    return model.setControlState(room_id, ctrl_id, { "state": "offline" });
                }
            } else util.logMessage("WARN", 'loadTasmotaState: ' + e.message + ' for ' + host);
        });
        return false;
    }
}

module.exports = TasmotaHandler;
