'use strict';

const fs = require('fs'); // import { readFileSync } from 'fs';
const util = require('hcutils');

class HouseModel {
    constructor(modelFile) {
        this.rooms = null;
        this.lastChanged = Date.now();
        try {
            const model = JSON.parse(fs.readFileSync(modelFile));
            if (!model) return;
            this.rooms = model.rooms;
            for(let room_id in this.rooms) {
                const room = this.rooms[room_id];
                for(let ctrl_id in room.ctrls) {
                    const ctrl = room.ctrls[ctrl_id];
                    ctrl.id = ctrl_id;
                    ctrl.room_id = room_id;
                    ctrl.fullname = `${room.name} ${ctrl.name}`;
                }
            }
        } catch(e) {
            util.logMessage("FATAL", `Error loading model: ${modelFile} => ${e.message}`);
        }
    }

    room(room_id) {
        return this.rooms[room_id];
    }

    control(room_id, ctrl_id) {
        return this.rooms[room_id].ctrls[ctrl_id];
    }

    setControlState(ctrl, state_info) {
        const now = Date.now();
        let updated = false;

        this.lastChanged = now;
        for(let key in state_info) {
            let val = "*none*";
            if(ctrl[key] !== undefined && ctrl[key] != null) val = ctrl[key];
            if(state_info[key] !== val) {
                util.logMessage("INFO", "setControlState: " + ctrl.fullname +
                    " > " + key + " changed from " + val + " to " + state_info[key]);
                ctrl[key] = state_info[key];
                ctrl.lastChanged = now;
                updated = true;
            }
        }
        return updated;
    }
}

// export default HouseModel;
module.exports = HouseModel;
