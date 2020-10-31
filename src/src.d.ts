interface PacketMessage {
    type: "message";
    payloadBase64: string;
    // id === sourceId
    id: string;

    // "server" is a special id
    sourceId: string;
    sourcePort: number;

    destId: string;
    destPort: number;
}
interface PacketDisconnected {
    type: "disconnected";
    id: string;
}
interface PacketConnected {
    type: "connected";
    id: string;
}

type Packets = PacketMessage | PacketDisconnected | PacketConnected;