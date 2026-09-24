// Content model automaton of a complex type, with the behaviour of
// System.Xml.Schema.ParticleContentValidator + DfaContentValidator: the syntax tree of the
// content particle (sequence, choice, ?, *, +) plus an end marker, its positions (Glushkov
// construction: firstpos, followpos) and the symbols in the order the element names are first
// added. A DFA state is the set of positions the subset construction would produce; transitions,
// the accept flag and the expected particles are computed from it exactly as the transition table
// of DfaContentValidator would give them.

import { QName } from './Datatypes.js';

/** A particle of the compiled content model (XmlSchemaElement / XmlSchemaAny / group). */
export type Particle = ElementParticle | AnyParticle | GroupParticle;

export interface ElementParticle {
  readonly kind: 'element';
  readonly qname: QName;
  readonly minOccurs: number;
  readonly maxOccurs: number;
  /** The element declaration (resolved lazily, types may be recursive). */
  readonly decl: () => unknown;
}

export interface AnyParticle {
  readonly kind: 'any';
  /** Only ##any is used by the CAEX schemas (xs:anyType). */
  readonly namespace: '##any';
  readonly processContents: 'strict' | 'lax' | 'skip';
  readonly minOccurs: number;
  readonly maxOccurs: number;
}

export interface GroupParticle {
  readonly kind: 'sequence' | 'choice';
  readonly items: readonly Particle[];
  readonly minOccurs: number;
  readonly maxOccurs: number;
}

type Node =
  | { t: 'leaf'; pos: number }
  | { t: 'seq' | 'choice'; left: Node; right: Node }
  | { t: 'star' | 'plus' | 'qmark'; child: Node };

/** Position: its symbol and particle (Positions.Add(symbol, particle)). */
interface Position {
  symbol: number;
  particle: Particle | null;
  /** Wildcard positions match every symbol (the expanded NamespaceListNode). */
  wildcard: boolean;
}

export class ContentModel {
  /** Symbol names in symbol order; the end marker has QName.Empty; `last` is the catch-all. */
  private readonly names = new Map<QName, number>();
  private readonly particles: (Particle | null)[] = [];
  private particleLast: Particle | null = null;
  private last = 0;
  private readonly positions: Position[] = [];
  private followpos: Set<number>[] = [];
  private firstpos = new Set<number>();
  private endMarker = -1;
  /** SymbolsDictionary.IsUpaEnforced: false when a name occurs with two different particles. */
  upaEnforced = true;

  /** Builds the model (ParticleContentValidator.Start ... Finish); null when the particle is empty. */
  static build(particle: Particle | null): ContentModel | null {
    if (particle === null) return null;
    const m = new ContentModel();
    const root = m.buildNode(particle);
    if (root === null) return null;
    m.finish(root);
    return m;
  }

  private addName(qname: QName, particle: Particle | null): number {
    const existing = this.names.get(qname);
    if (existing !== undefined) {
      if (this.particles[existing] !== particle) this.upaEnforced = false;
      return existing;
    }
    this.names.set(qname, this.last);
    this.particles.push(particle);
    return this.last++;
  }

  private addPosition(symbol: number, particle: Particle | null, wildcard = false): number {
    this.positions.push({ symbol, particle, wildcard });
    return this.positions.length - 1;
  }

  /** BuildParticleContentModel (the tree shape does not change the automaton). */
  private buildNode(p: Particle): Node | null {
    let node: Node | null;
    if (p.kind === 'element') {
      node = { t: 'leaf', pos: this.addPosition(this.addName(p.qname, p), p) };
    } else if (p.kind === 'any') {
      this.particleLast = p;
      node = { t: 'leaf', pos: this.addPosition(-1, p, true) };
    } else {
      node = null;
      for (const item of p.items) {
        const child = this.buildNode(item);
        if (child === null) continue;
        node = node === null ? child : { t: p.kind === 'choice' ? 'choice' : 'seq', left: node, right: child };
      }
    }
    if (node === null) return null;
    const min = p.minOccurs;
    const max = p.maxOccurs;
    if (min === 1 && max === 1) return node;
    if (min === 0 && max === 1) return { t: 'qmark', child: node };
    if (min === 0 && max === Infinity) return { t: 'star', child: node };
    if (min === 1 && max === Infinity) return { t: 'plus', child: node };
    throw new Error(`occurrence range ${min}..${max} is not supported (RangeContentValidator)`);
  }

  private finish(content: Node): void {
    const endSymbol = this.addName(QName.Empty, null);
    this.endMarker = this.addPosition(endSymbol, null);
    // Wildcard positions take the catch-all symbol (_last) for names not in the dictionary.
    for (const pos of this.positions) if (pos.wildcard) pos.symbol = this.last;
    const root: Node = { t: 'seq', left: content, right: { t: 'leaf', pos: this.endMarker } };
    this.followpos = this.positions.map(() => new Set<number>());
    const info = this.construct(root);
    this.firstpos = info.first;
  }

  private construct(n: Node): { first: Set<number>; last: Set<number>; nullable: boolean } {
    switch (n.t) {
      case 'leaf':
        return { first: new Set([n.pos]), last: new Set([n.pos]), nullable: false };
      case 'seq': {
        const a = this.construct(n.left);
        const b = this.construct(n.right);
        for (const i of a.last) for (const j of b.first) this.followpos[i]!.add(j);
        return {
          first: a.nullable ? union(a.first, b.first) : a.first,
          last: b.nullable ? union(a.last, b.last) : b.last,
          nullable: a.nullable && b.nullable,
        };
      }
      case 'choice': {
        const a = this.construct(n.left);
        const b = this.construct(n.right);
        return { first: union(a.first, b.first), last: union(a.last, b.last), nullable: a.nullable || b.nullable };
      }
      default: {
        const c = this.construct(n.child);
        if (n.t !== 'qmark') for (const i of c.last) for (const j of c.first) this.followpos[i]!.add(j);
        return { first: c.first, last: c.last, nullable: n.t === 'plus' ? c.nullable : true };
      }
    }
  }

  /** Number of symbols (SymbolsDictionary.Count). */
  private get symbolCount(): number {
    return this.last + 1;
  }

  /** SymbolsDictionary[name]. */
  private symbolOf(name: QName): number {
    return this.names.get(name) ?? this.last;
  }

  /** SymbolsDictionary.GetParticle(symbol). */
  private particleOf(symbol: number): Particle | null {
    return symbol !== this.last ? this.particles[symbol]! : this.particleLast;
  }

  private matches(pos: Position, symbol: number): boolean {
    return pos.wildcard ? true : pos.symbol === symbol;
  }

  /** DFA state 0. */
  get initialState(): ReadonlySet<number> {
    return this.firstpos;
  }

  /** The accept column of the transition table. */
  isAccepting(state: ReadonlySet<number>): boolean {
    return state.has(this.endMarker);
  }

  /** DfaContentValidator.ValidateElement: next state and the matched particle, or null. */
  step(state: ReadonlySet<number>, name: QName): { state: Set<number>; particle: Particle | null } | null {
    const symbol = this.symbolOf(name);
    const next = new Set<number>();
    for (const p of state) if (this.matches(this.positions[p]!, symbol)) for (const f of this.followpos[p]!) next.add(f);
    if (next.size === 0) return null;
    return { state: next, particle: this.particleOf(symbol) };
  }

  /** DfaContentValidator.ExpectedParticles: particles of the symbols with a transition, in symbol order. */
  expectedParticles(state: ReadonlySet<number>): Particle[] {
    const result: Particle[] = [];
    for (let i = 0; i < this.symbolCount; i++) {
      let possible = false;
      for (const p of state) {
        const pos = this.positions[p]!;
        if (this.matches(pos, i) && this.followpos[p]!.size > 0) {
          possible = true;
          break;
        }
      }
      if (!possible) continue;
      const particle = this.particleOf(i);
      if (particle !== null && !result.includes(particle)) result.push(particle);
    }
    return result;
  }
}

function union(a: Set<number>, b: Set<number>): Set<number> {
  const r = new Set(a);
  for (const x of b) r.add(x);
  return r;
}
