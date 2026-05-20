# Spec Delta: architecture

## ADDED Requirements

### Requirement: Hexagonal Layer Structure

The codebase SHALL be organized into five top-level layers under `src/`: `domain/`, `application/`, `adapters/inbound/`, `adapters/outbound/`, and `composition/`, with `shared/` available to all layers for configuration, constants, and cross-cutting utilities.

#### Scenario: New layer folders exist after the refactor
- **WHEN** the migration completes
- **THEN** `src/domain/`, `src/application/`, `src/adapters/inbound/`, `src/adapters/outbound/`, and `src/composition/` exist
- **AND** `src/modules/` and `src/infrastructure/` no longer exist
- **AND** `src/index.ts` re-exports or imports from `src/composition/bootstrap.ts` only

#### Scenario: Each business operation lives under `application/`
- **WHEN** a developer searches for a use case class (e.g. `SubscribeUseCase`)
- **THEN** exactly one file under `src/application/<bounded-context>/` defines it
- **AND** the file imports only from `src/domain/**` and `src/shared/**`

### Requirement: Dependency Direction Rule

Dependencies SHALL point inward toward `domain/`. `domain/` MUST NOT import from `application/`, `adapters/`, or `composition/`. `application/` MUST NOT import from `adapters/` or `composition/`. `adapters/inbound/` MUST NOT import from `adapters/outbound/` and vice versa. Only `composition/` MAY import concrete classes from both adapter sides.

#### Scenario: Domain layer is pure
- **WHEN** `dependency-cruiser` analyzes the codebase
- **THEN** no file under `src/domain/**` imports from `src/application/**`, `src/adapters/**`, or `src/composition/**`
- **AND** the rule `domain-must-be-pure` reports zero violations

#### Scenario: Application layer depends only on ports
- **WHEN** `dependency-cruiser` analyzes the codebase
- **THEN** no file under `src/application/**` imports from `src/adapters/**` or `src/composition/**`
- **AND** the rule `application-no-adapters` reports zero violations

#### Scenario: Adapters do not cross-talk
- **WHEN** `dependency-cruiser` analyzes the codebase
- **THEN** no file under `src/adapters/inbound/**` imports from `src/adapters/outbound/**`
- **AND** no file under `src/adapters/outbound/**` imports from `src/adapters/inbound/**`
- **AND** rules `inbound-no-outbound` and `outbound-no-inbound` report zero violations

#### Scenario: Inbound adapters reach use cases through inbound ports only
- **WHEN** a Fastify route handler invokes business behavior
- **THEN** it does so through an inbound port interface declared in `src/domain/ports/inbound/`
- **AND** it does not import a use-case implementation file from `src/application/**` directly

### Requirement: Mechanical Enforcement of Dependency Rule

The dependency-direction rule SHALL be enforced by `dependency-cruiser` (or an equivalent dependency-graph linter), wired into `npm run lint`, and run in CI on every push and pull request to `main`.

#### Scenario: CI rejects a layer-violating change
- **WHEN** a pull request introduces an import from `src/domain/` to `src/adapters/`
- **THEN** the `lint` job in `.github/workflows/ci.yml` fails
- **AND** the failure message names the violated rule (e.g. `domain-must-be-pure`)

#### Scenario: Lint script runs dependency-cruiser
- **WHEN** a developer runs `npm run lint` locally
- **THEN** the command runs both ESLint and `depcruise`
- **AND** exits non-zero if either reports an error

### Requirement: Composition Root

A single composition root SHALL exist at `src/composition/container.ts` that wires every concrete adapter to its port. No other file in `src/` MAY instantiate an adapter class directly; everything else SHALL receive collaborators through constructor injection.

#### Scenario: Adapters are constructed only in the composition root
- **WHEN** a grep searches for `new <Adapter>` (e.g. `new NodemailerMailer`, `new SubscriptionDrizzleRepository`)
- **THEN** every match resides in `src/composition/**` or in `*.spec.ts` test files
- **AND** no match resides under `src/application/**` or `src/domain/**`

#### Scenario: Application classes receive ports via constructor
- **WHEN** an application use-case class is instantiated
- **THEN** its constructor parameters are all typed as port interfaces from `src/domain/ports/outbound/**`
- **AND** no constructor parameter is typed as a concrete adapter class

### Requirement: Port and Adapter Naming Conventions

Port interfaces SHALL live under `src/domain/ports/{inbound,outbound}/` with filename `<concept>.<port-kind>.ts` (e.g. `subscribe.use-case.ts`, `vcs-provider.ts`). Adapter files SHALL live under `src/adapters/{inbound,outbound}/<integration>/` with filename `<integration>.<role>.ts` (e.g. `nodemailer.mailer.ts`, `subscription.drizzle.repository.ts`).

#### Scenario: Inbound port files are named after the use case
- **WHEN** a use case named `Subscribe` is introduced
- **THEN** its inbound port lives at `src/domain/ports/inbound/subscribe.use-case.ts`
- **AND** its application class lives at `src/application/subscription/subscribe.use-case.ts`

#### Scenario: Outbound adapter file names reveal the technology
- **WHEN** the SMTP mailer adapter is read
- **THEN** the file path is `src/adapters/outbound/mailer/nodemailer/nodemailer.mailer.ts`
- **AND** the class name is `NodemailerMailer`
- **AND** the class implements the `Mailer` port from `src/domain/ports/outbound/mailer.ts`
