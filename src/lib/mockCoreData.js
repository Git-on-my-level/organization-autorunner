const actors = [];
const events = [];

export function listMockActors() {
  return actors;
}

export function createMockActor(actor) {
  actors.push(actor);
  return actor;
}

export function createMockEvent(event) {
  events.push(event);
  return event;
}
