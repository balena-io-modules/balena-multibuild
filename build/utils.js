"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const Promise = require("bluebird");
const _ = require("lodash");
const tar = require("tar-stream");
function drainStream(stream) {
    return new Promise((resolve, reject) => {
        stream.on('data', _.noop);
        stream.on('error', reject);
        stream.on('end', resolve);
    });
}
exports.drainStream = drainStream;
function generateBuildTasks(composition) {
    return _.map(composition.services, (service) => {
        if (_.isString(service.build)) {
            return {
                external: true,
                imageName: service.build,
                serviceName: service.name,
            };
        }
        else {
            return _.merge({
                external: false,
                serviceName: service.name,
                buildStream: tar.pack(),
            }, service.build);
        }
    });
}
exports.generateBuildTasks = generateBuildTasks;

//# sourceMappingURL=utils.js.map
