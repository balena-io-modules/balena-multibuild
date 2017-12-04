"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const Promise = require("bluebird");
const Resolve = require("resin-bundle-resolve");
const errors_1 = require("./errors");
function resolveTask(task, architecture, deviceType) {
    if (task.external) {
        return Promise.resolve(task);
    }
    const dockerfileHook = (content) => {
        task.dockerfile = content;
        return Promise.resolve();
    };
    const bundle = new Resolve.Bundle(task.buildStream, deviceType, architecture, dockerfileHook);
    const resolvers = Resolve.getDefaultResolvers();
    return Resolve.resolveBundle(bundle, resolvers)
        .then((res) => {
        task.projectType = res.projectType;
        task.buildStream = res.tarStream;
        return task;
    })
        .catch((e) => {
        throw new errors_1.ProjectResolutionError(e);
    });
}
exports.resolveTask = resolveTask;

//# sourceMappingURL=resolve.js.map
