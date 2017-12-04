// import * as Promise from 'bluebird';
// import * as Dockerode from 'dockerode';
// import { Builder, BuildHooks } from 'resin-docker-build';
// import * as Stream from 'stream';
//
// import { BuildTask } from './build-task';
// import { LocalImage } from './local-image';
//
// function taskHooks(task: BuildTask): BuildHooks {
//   return {
//     buildSuccess: (imageId: string, layers: string[]) => {
//     },
//     buildFailure: (error: Error, layers: string[]) => {
//     },
//     buildStream: (stream: Stream.Duplex) => {
//     }
//   };
// }
//
/**
 * Given a build task which is primed with the necessary input, perform either
 * a build or a docker pull, and return this as a LocalImage.
 *
 * @param task The build task to perform
 * @param docker The handle to the docker daemon
 * @return a promise which resolves to a LocalImage which points to the produced image
 */
// export function runBuildTask(task: BuildTask, docker: Dockerode): Promise<LocalImage> {
//
//   return Promise
//   const hooks = taskHooks(task);
//
// }
