import * as net from "net";
import WebSocket from "ws";

import * as dgram from "dgram";
import { selfIdentifyTCPPort, serverAddress, vpnTCPPort, serverUDPPort } from "./common";



main().catch(e => console.error(e));

async function isServer() {
    let serverSocket = net.createServer(socket => { });
    serverSocket.listen(selfIdentifyTCPPort, "0.0.0.0");

    let isServerCallback: (isServer: boolean) => void;
    let isServerPromise = new Promise<boolean>(x => isServerCallback = x);

    let socket = net.connect(selfIdentifyTCPPort, serverAddress);
    socket.on("connect", () => {
        isServerCallback(true);
        serverSocket.close();
    });
    socket.on("error", () => {
        isServerCallback(false);
        serverSocket.close();
    });

    setTimeout(() => isServerCallback(false), 500);

    return isServerPromise;
}

async function main() {

    if(await isServer()) {
        let clientResolve: (clientPromise: Promise<void>) => void;
        let clientPromise = new Promise(x => clientResolve = x);

        console.log("Running as VPN exchange");

        let clients: Map<string, WebSocket> = new Map();

        let server = new WebSocket.Server({ port: vpnTCPPort });
        server.on("connection", socket => {
            socket.on("message", data => {
                console.log("Received", data);

                let packet = JSON.parse(data.toString("utf8")) as Packets;
                clients.set(packet.id, socket);
                if(packet.type === "disconnected") {
                    clients.delete(packet.id);

                    // Forward the disconnected message to everyone
                    for(let otherClient of clients.values()) {
                        otherClient.send(packet);
                    }
                } else if(packet.type === "message") {
                    let destClient = clients.get(packet.destId);
                    if(!destClient) {
                        console.error(`Cannot find client for packet`, packet);
                        return;
                    }
                    destClient.send(packet);
                }
            });
            socket.on("error", (err) => {
                console.log(err);
            });
        });
        server.on("error", err => {
            console.log("Switching to run as user, as exchange port is already being used");
            clientResolve(runClient());
        });

        await clientPromise;
    } else {
        await runClient();
    }


}

// client => client-vpn => server-vpn => other-client-vpn => client

async function getUDPSocket(
    portOverride: number|undefined,
    handler: (msg: Buffer, rinfo: dgram.RemoteInfo) => void
): Promise<{
    socket: dgram.Socket,
    port: number
}> {
    while(true) {
        let port = portOverride || ~~(Math.random() * (65535 - 49152) + 49152);
        let socket = dgram.createSocket("udp4", handler);
        let resolve: (free: boolean) => void;
        let reject: (err: any) => void;
        let resolvePromise = new Promise((x, y) => { resolve = x; reject = y; });
        socket.on("listening", () => {
            resolve(true);
        });
        socket.on("error", (err) => {
            if(portOverride) {
                reject(err);
            } else {
                resolve(false);
            }
        });
        if(await resolvePromise) {
            console.log(`Opened UDP tunnel socket on port ${port}`);
            return {
                socket,
                port
            };
        }
    }
}

async function runClient() {
    let clientServer = process.argv.some(x => x.endsWith("server"));

    console.log(`Running as user, ${clientServer ? "server" : "client"}`);
    // remote port SOURCE + "_" + remoteId => local port SOURCE
    //  We need this, because the remotes can ensure their source ports are unique,
    //  but multiple remotes may have the same ports, so we need to remap them.
    // TODO: Stop leaking entries in this map, and free them when clients disconnect
    let remotePortMappings: Map<string, number> = new Map();

    let messageSources: Map<string, { socket: dgram.Socket; port: number }> = new Map();
    async function getSocket(remoteId: string, portOverride?: number) {
        let socketObj = messageSources.get(remoteId);
        if(!socketObj) {
            socketObj = await getUDPSocket(portOverride, (message, info) => {
                let packet: PacketMessage = {
                    type: "message",
                    payloadBase64: message.toString("base64"),

                    id: ourId,

                    sourceId: ourId,
                    sourcePort: info.port,

                    destId: remoteId,
                    destPort:  socketObj?.port || 0,
                };
                vpnConnection.send(JSON.stringify(packet));
            });
            messageSources.set(remoteId, socketObj);
        }
        return socketObj;
    }


    const ourId = clientServer ? "server" : (Date.now() + "_" + Math.random());

    let vpnConnection = new WebSocket("ws://" + serverAddress + ":" + vpnTCPPort);

    vpnConnection.on("open", async () => {
        console.log("Connect to VPN exchange");
        let packet: PacketConnected = {
            type: "connected",
            id: ourId,
        };
        vpnConnection.send(JSON.stringify(packet));
        if(!clientServer) {
            await getSocket("server", serverUDPPort);
        }
    });

    vpnConnection.on("message", async (message) => {
        let packet = JSON.parse(message.toString("utf8")) as Packets;
        if(packet.type === "message") {
            let socket = await getSocket(packet.sourceId);
            remotePortMappings.set(packet.sourcePort + "_" + packet.destId, socket.port);
            let buffer = Buffer.from(packet.payloadBase64, "base64");
            // Remote messages are send to the local machine via tunnel through the VPN,
            //  popping out from a UDP port created locally.
            socket.socket.send(buffer, packet.destPort, "127.0.0.1");
        } else if(packet.type === "disconnected") {
            let socket = messageSources.get(packet.id);
            if(socket) {
                socket.socket.disconnect();
            }
        } else if(packet.type === "connected") {

        } else {
            let unhandledType: never = packet;
        }
    });
}