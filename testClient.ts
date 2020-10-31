import * as dgram from "dgram";
import { serverUDPPort } from "./common";

let socket = dgram.createSocket("udp4", (message, info) => {
    console.log(message.toString("utf8"), info);
});
socket.bind(0);
socket.send("Hi, I'm a client", serverUDPPort);