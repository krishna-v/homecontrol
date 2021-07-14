'use strict';
const util = require('hcutils');

class KNXHandler {

    relayCmd(model, room_id, ctrl_id, key, value) {
        const ctrl = model.control(room_id, ctrl_id);
        util.logMessage("INFO", "KNXHandler::relayCmd(): Turning " + (value === "1" ? "on " : "off ") +
            model.room(room_id).name + " " + ctrl.name);
        const host = ctrl.host;	
        const cmdstr = '/cgi-bin/writeVal.cgi?KNX.g%5B' + room_id + '%5D.f%5B' + ctrl_id + '%5D.v%5B1%5D+' + value;
        util.doRemoteCmd(host, 80, cmdstr).catch((e) => { util.logMessage("WARN", 'KNXHandler::relayCmd(): ' + e.message); });
    }

    loadState(model, room_id, ctrl_id) {
        const ctrl = model.control(room_id, ctrl_id);
        const host = ctrl.host;	
        const arg = '/cgi-bin/readVal.cgi?KNX.g%5B' + room_id + '%5D.f%5B' + ctrl_id + '%5D.v%5B2%5D';
        util.doRemoteCmd(host, 80, arg).then((data) => {;
            try {
                if(data !== "0" && data !== "1") {
                    util.logMessage("WARN", "loadKNXState: received data for room " + 
                        room_id + ", ctrl " + ctrl_id + " : " + data);
                }
            } catch(e) {
                util.logMessage("WARN", 'loadKNXState: ' + e.message + ' for ' + room_id + "." + ctrl_id);
            }
            const state = (data === "1") ? "on" : "off";
            return model.setControlState(room_id, ctrl_id, { "state": state });
        }, (e) => { 
            if(e.code === 'EHOSTUNREACH') {
                // host offline.
                if(ctrl.state !== "offline") {
                    util.logMessage("WARN", 'loadKNXState: ' + e.message + ' for ' + room_id + "." + ctrl_id);
                    return model.setControlState(room_id, ctrl_id, { "state": "offline" });
                }
            } else util.logMessage("WARN", 'loadKNXState: ' + e.message + ' for ' + room_id + "." + ctrl_id);
        });
        return false;
    }
}

module.exports = KNXHandler;
