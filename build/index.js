"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const Promise = require("bluebird");
const _ = require("lodash");
const tar = require("tar-stream");
const TarUtils = require("tar-utils");
const errors_1 = require("./errors");
const PathUtils = require("./path-utils");
const resolve_1 = require("./resolve");
const Utils = require("./utils");
function splitBuildStream(composition, buildStream) {
    return new Promise((resolve, reject) => {
        const tasks = Utils.generateBuildTasks(composition);
        const extract = tar.extract();
        const entryFn = (header, stream, next) => {
            const matchingTask = _.find(tasks, (task) => {
                if (task.external) {
                    return false;
                }
                return PathUtils.contains(task.context, header.name);
            });
            if (matchingTask != null) {
                const newHeader = header;
                newHeader.name = PathUtils.resolve(matchingTask.context, header.name);
                TarUtils.streamToBuffer(stream)
                    .then((buf) => {
                    matchingTask.buildStream.entry(newHeader, buf);
                    next();
                })
                    .catch((e) => {
                    reject(new errors_1.TarError(e));
                });
            }
            else {
                Utils.drainStream(stream)
                    .then(() => {
                    next();
                })
                    .catch((e) => {
                    reject(new errors_1.TarError(e));
                });
            }
        };
        extract.on('entry', entryFn);
        extract.on('finish', () => {
            _.each(tasks, (task) => {
                if (!task.external) {
                    task.buildStream.finalize();
                }
            });
            resolve(tasks);
        });
        extract.on('error', (e) => {
            reject(new errors_1.TarError(e));
        });
        buildStream.pipe(extract);
    });
}
exports.splitBuildStream = splitBuildStream;
function performResolution(tasks, architecture, deviceType) {
    return Promise.map(tasks, (task) => {
        return resolve_1.resolveTask(task, architecture, deviceType);
    });
}
exports.performResolution = performResolution;

//# sourceMappingURL=index.js.map
