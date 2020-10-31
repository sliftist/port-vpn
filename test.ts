import * as dgram from "dgram";
import { clientUDPPort } from "./common";

let socket = dgram.createSocket("udp4", (message, info) => {
    console.log(message, info);
});
socket.bind(0);
socket.send("test", clientUDPPort);