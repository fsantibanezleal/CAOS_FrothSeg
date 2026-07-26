import { readFile, writeFile } from 'node:fs/promises';
import { runClassical, type ClassicalMethod } from '../src/classical/methods';

interface InputCase {
  sample_id: string;
  width: number;
  height: number;
  gray: number[];
}

const [inputPath, outputPath] = process.argv.slice(2);
if (!inputPath || !outputPath) {
  throw new Error('usage: run_classical_parity.ts <input.json> <output.json>');
}

const methods: ClassicalMethod[] = ['otsu_cc', 'watershed_hmax', 'watershed_dt'];
const input = JSON.parse(await readFile(inputPath, 'utf8')) as { cases: InputCase[] };
const cases = input.cases.map((source) => {
  const gray = Float32Array.from(source.gray);
  return {
    sample_id: source.sample_id,
    methods: Object.fromEntries(methods.map((method) => [
      method,
      Array.from(runClassical(method, gray, source.width, source.height)),
    ])),
  };
});
await writeFile(outputPath, JSON.stringify({
  schema: 'frothseg.classical-live-output/v1',
  methods,
  cases,
}));
