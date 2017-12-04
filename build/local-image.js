"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const errors_1 = require("./errors");
class LocalImage {
    constructor(daemon, name, external, successful) {
        this.daemon = daemon;
        this.name = name;
        this.external = external;
        this.successful = successful;
    }
    getImage() {
        return this.daemon.getImage(this.name);
    }
    deleteImage() {
        const image = this.getImage();
        return image.remove()
            .catch((e) => {
            throw new errors_1.ImageRemovalError(e);
        });
    }
}
exports.LocalImage = LocalImage;

//# sourceMappingURL=local-image.js.map
