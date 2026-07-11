/**
 * Architectural dependency rules for the notifier service.
 *
 * Layers (outer may depend on inner, never the reverse):
 *
 *   shared            - config/errors/logger/types/utils/generic plugins. No internal deps at all.
 *   generated          - protobuf stubs (buf/ts-proto). No internal deps at all.
 *   infrastructure     - technical adapters (db, cache, grpc transport, metrics, queue, scheduler).
 *                        May depend on shared/generated, and on module *ports* (type-only) to
 *                        implement them (dependency inversion), never on module runtime code.
 *   modules/<name>     - business modules. Internally layered as:
 *                          types/ , *.schemas.ts   (domain data - no deps on the rest of the module)
 *                          interfaces/             (ports - depend only on the module's own types)
 *                          *.service.ts, *.repository.ts, infrastructure/, adapters/ (impl - may
 *                          depend on ports/types, shared, infrastructure, other modules' barrels)
 *                          *.routes.ts, *.grpc.ts  (presentation - same rights as impl)
 *                          index.ts                (public barrel - the only door other modules use)
 *   modules/saga        - orchestration layer: may depend on other modules' barrels, but no other
 *                        module may depend back on saga (keeps the module graph acyclic).
 *   notifier/, index.ts,
 *   server.ts, container.ts - composition roots. May depend on everything. Nothing depends on them,
 *                        except `server.ts`'s AppServer type, which route handlers need for typing.
 *
 * Cross-module imports must go through the target module's public barrel (index.ts) rather than
 * reaching into its internals - that boundary is enforced by eslint's `no-restricted-imports`
 * rule (see eslint.config.mjs), since it needs to distinguish "this file is inside the module it's
 * importing from" from "this is a different module", which a path-only dependency-cruiser rule
 * cannot express without knowing which module is doing the importing.
 *
 * Run `npm run arch:check` to validate, `npm run arch:graph` for a visual dependency graph.
 */

/** @type {import('dependency-cruiser').IConfiguration} */
module.exports = {
  forbidden: [
    {
      name: 'no-circular',
      severity: 'error',
      comment:
        'Circular imports make module boundaries meaningless and break the layering below. ' +
        'Cycles made up entirely of `import type` edges are exempted: they vanish at compile ' +
        'time (TS erases them), so they never cause a runtime circular-require problem - they ' +
        "just mean two modules reference each other's *shape*, which dependency inversion (a " +
        "module depending on another's port/type) legitimately requires both ways sometimes.",
      from: {},
      to: { circular: true, dependencyTypesNot: ['type-only'] },
    },
    {
      name: 'shared-is-a-leaf',
      severity: 'error',
      comment:
        'src/shared is the innermost layer (config, errors, logger, types, generic plugins). ' +
        'It must not know about infrastructure, business modules, or composition roots.',
      from: { path: '^src/shared' },
      to: {
        path: '^src/(modules|infrastructure|notifier)|^src/(index|server|container)\\.ts$',
      },
    },
    {
      name: 'generated-is-a-leaf',
      severity: 'error',
      comment:
        'src/generated holds protobuf-generated stubs and must not depend on hand-written code.',
      from: { path: '^src/generated' },
      to: { path: '^src/(shared|modules|infrastructure|notifier)' },
    },
    {
      name: 'infrastructure-no-module-runtime-deps',
      severity: 'error',
      comment:
        'src/infrastructure may implement a port defined by a module (type-only import), but ' +
        "must never depend on a module's runtime code - that would make generic infrastructure " +
        'depend on business logic.',
      from: { path: '^src/infrastructure' },
      to: { path: '^src/modules', dependencyTypesNot: ['type-only'] },
    },
    {
      name: 'infrastructure-no-composition-root-deps',
      severity: 'error',
      comment:
        'Infrastructure is wired BY composition roots, it must not import them.',
      from: { path: '^src/infrastructure' },
      to: { path: '^src/notifier|^src/(index|server|container)\\.ts$' },
    },
    {
      name: 'modules-no-composition-root-deps',
      severity: 'error',
      comment:
        'Business modules are wired by composition roots (container.ts, index.ts, notifier/); ' +
        'they must not import from them. server.ts is the one exception: it only exports the ' +
        '(type-only) AppServer type route handlers need to type their `server` parameter.',
      from: { path: '^src/modules' },
      to: {
        path: '^src/notifier|^src/(index|container)\\.ts$',
      },
    },
    {
      name: 'modules-no-composition-root-runtime-deps',
      severity: 'error',
      comment:
        'Modules may only use server.ts for its AppServer type, never its runtime value.',
      from: { path: '^src/modules' },
      to: { path: '^src/server\\.ts$', dependencyTypesNot: ['type-only'] },
    },
    {
      name: 'no-reverse-dependency-on-saga',
      severity: 'error',
      comment:
        'saga is an orchestration layer sitting above the other business modules (it composes ' +
        'their ports to run the subscribe saga/2PC flow). Other modules must depend on it only ' +
        'through their own port interfaces (dependency inversion), never import it directly.',
      from: { path: '^src/modules/(?!saga/)' },
      to: { path: '^src/modules/saga' },
    },
    {
      name: 'module-types-are-pure',
      severity: 'error',
      comment:
        "types/ and *.schemas.ts hold plain domain data and must not depend on their module's " +
        'own ports or implementation - they are the innermost layer of a module.',
      from: { path: '^src/modules/[^/]+/(types/|[^/]+\\.schemas\\.ts$)' },
      to: {
        path: '^src/modules/[^/]+/(interfaces/|infrastructure/|adapters/)',
      },
    },
    {
      name: 'module-ports-do-not-depend-on-implementation',
      severity: 'error',
      comment:
        "interfaces/ (ports) define a contract the module's own adapters implement. A port " +
        'must not depend on infrastructure/adapters/** (its own or - via a module barrel - ' +
        "another module's), or that would invert the dependency and defeat the point of the port.",
      from: { path: '^src/modules/[^/]+/interfaces/' },
      to: {
        path: '(^src/modules/[^/]+/(infrastructure|adapters)/)|(^src/infrastructure)',
      },
    },
  ],
  options: {
    tsPreCompilationDeps: true,
    tsConfig: { fileName: 'tsconfig.json' },
    doNotFollow: { path: 'node_modules' },
    exclude: { path: '\\.spec\\.ts$' },
    enhancedResolveOptions: {
      exportsFields: ['exports'],
      conditionNames: ['import', 'require', 'node', 'default'],
    },
  },
};
