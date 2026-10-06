// Send every control change immediately; only held controls need a keepalive.
// 150 ms stays comfortably inside the server's 400 ms lost-input deadline.
export class InputChannel {
 reset() { this.last = null; this.sentAt = -Infinity; this.sequence = 0; }
 constructor() { this.reset(); }
 encode(input, now, active) {
 const message = JSON.stringify(input);
 if (message === this.last && (!active || now - this.sentAt < 150)) return null;
 this.last = message; this.sentAt = now;
 return JSON.stringify({...input, sequence: ++this.sequence });
 }
}
