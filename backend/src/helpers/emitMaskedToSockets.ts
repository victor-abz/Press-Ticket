import { Server } from "socket.io";

const isAdminProfile = (profile?: string): boolean =>
  profile === "admin" || profile === "masteradmin";

interface EmitMaskedToSocketsOptions<T> {
  io: Server;
  rooms?: string[];
  event: string;
  buildPayload: (profile: string) => T;
}

/**
 * Emite um evento para os sockets conectados, calculando o payload
 * com base no profile de cada socket destinatário (não no profile de
 * quem disparou a ação). Necessário porque as rooms de ticket/contact
 * são compartilhadas entre perfis admin e não-admin.
 */
const emitMaskedToSockets = async <T>({
  io,
  rooms,
  event,
  buildPayload
}: EmitMaskedToSocketsOptions<T>): Promise<void> => {
  const sockets =
    rooms && rooms.length > 0
      ? await io.in(rooms).fetchSockets()
      : await io.fetchSockets();

  const adminSocketIds: string[] = [];
  const nonAdminSocketIds: string[] = [];

  for (const socket of sockets) {
    const profile = (socket.data as { profile?: string } | undefined)
      ?.profile;
    if (isAdminProfile(profile)) {
      adminSocketIds.push(socket.id);
    } else {
      nonAdminSocketIds.push(socket.id);
    }
  }

  if (adminSocketIds.length > 0) {
    io.to(adminSocketIds).emit(event, buildPayload("admin"));
  }
  if (nonAdminSocketIds.length > 0) {
    io.to(nonAdminSocketIds).emit(event, buildPayload("agent"));
  }
};

export default emitMaskedToSockets;
