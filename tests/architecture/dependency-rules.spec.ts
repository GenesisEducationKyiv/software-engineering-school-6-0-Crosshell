import { describe, it, expect } from 'vitest';
import { resolve } from 'node:path';
import { cruise } from 'dependency-cruiser';
import type { ICruiseResult, IFlattenedRuleSet } from 'dependency-cruiser';

const root = resolve(__dirname, '../..');

interface IArchConfig {
  forbidden: IFlattenedRuleSet['forbidden'];
  options: Record<string, unknown>;
}

describe('architecture boundaries (dependency-cruiser)', () => {
  it('has no violations of the layered architecture defined in .dependency-cruiser.cjs', async () => {
    const configModule = (await import(
      resolve(root, '.dependency-cruiser.cjs')
    )) as { default: IArchConfig };
    const config = configModule.default;

    const { output } = await cruise([resolve(root, 'src')], {
      ...config.options,
      validate: true,
      ruleSet: { forbidden: config.forbidden },
      outputType: 'json',
    });

    const result = JSON.parse(output as string) as ICruiseResult;
    const violations = result.summary.violations.map(
      (v) => `[${v.rule.name}] ${v.from} -> ${v.to}`,
    );

    expect(violations, violations.join('\n')).toHaveLength(0);
  });
});
