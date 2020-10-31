import * as dgram from "dgram";
import { serverUDPPort } from "./common";

let socket = dgram.createSocket("udp4", (message, info) => {
    console.log(message.toString("utf8"), info);
    socket.send("Hi, client, I'm the server", info.port);
});
socket.bind({ port: serverUDPPort, exclusive: false });