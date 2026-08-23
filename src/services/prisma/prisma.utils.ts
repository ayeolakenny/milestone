type Id = string;
type HasId = Id | { id: Id };

export function toId(id: HasId) {
  return { id: typeof id === 'object' ? id.id : id };
}

export function connectId(id: string) {
  return { connect: { id } };
}

export function connectIds(items: HasId[]) {
  return { connect: items.map(toId) };
}

export function createAttachments(uploadIds: string[]) {
  if (!uploadIds.length) return { create: {} };
  return { create: { uploads: connectIds(uploadIds) } };
}
