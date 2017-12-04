"use strict";
function __export(m) {
    for (var p in m) if (!exports.hasOwnProperty(p)) exports[p] = m[p];
}
Object.defineProperty(exports, "__esModule", { value: true });
const path_1 = require("path");
__export(require("path"));
exports.contains = (path1, path2) => {
    path1 = path1.normalize();
    path2 = path2.normalize();
    return !/^\.\.$|\.\.\//.test(path_1.relative(path1, path2));
};

//# sourceMappingURL=path-utils.js.map
