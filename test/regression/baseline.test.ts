import { describe, it, expect } from "vitest";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { convert } from "../../src/index";

const FIXTURES = resolve(__dirname, "../../fixtures/regression");

describe("regression baseline - standard utilities", () => {
  it("captures css and component output", async () => {
    const source = `<div className="flex items-center gap-4 p-6"><h2 className="text-lg font-bold">Title</h2><p className="text-sm text-gray-500">Desc</p></div>`;
    const result = await convert(source, "test.tsx");

    await expect(result.css).toMatchFileSnapshot(
      resolve(FIXTURES, "standard-utilities.css"),
    );
    await expect(result.component).toMatchFileSnapshot(
      resolve(FIXTURES, "standard-utilities.component.tsx"),
    );
  });
});

describe("regression baseline - pseudo-class variants", () => {
  it("captures css and component output", async () => {
    const source = `<button className="bg-blue-500 hover:bg-blue-700 focus:outline-none active:bg-blue-800 disabled:opacity-50">Click</button>`;
    const result = await convert(source, "test.tsx");

    await expect(result.css).toMatchFileSnapshot(
      resolve(FIXTURES, "pseudo-variants.css"),
    );
    await expect(result.component).toMatchFileSnapshot(
      resolve(FIXTURES, "pseudo-variants.component.tsx"),
    );
  });
});

describe("regression baseline - responsive variants", () => {
  it("captures css and component output", async () => {
    const source = `<div className="flex sm:grid md:hidden lg:block xl:inline-flex">content</div>`;
    const result = await convert(source, "test.tsx");

    await expect(result.css).toMatchFileSnapshot(
      resolve(FIXTURES, "responsive-variants.css"),
    );
    await expect(result.component).toMatchFileSnapshot(
      resolve(FIXTURES, "responsive-variants.component.tsx"),
    );
  });
});

describe("regression baseline - stacked variants", () => {
  it("captures css and component output", async () => {
    const source = `<div className="dark:hover:bg-gray-800 dark:text-white">content</div>`;
    const result = await convert(source, "test.tsx");

    await expect(result.css).toMatchFileSnapshot(
      resolve(FIXTURES, "stacked-variants.css"),
    );
    await expect(result.component).toMatchFileSnapshot(
      resolve(FIXTURES, "stacked-variants.component.tsx"),
    );
  });
});

describe("regression baseline - arbitrary values", () => {
  it("captures css and component output", async () => {
    const source = `<div className="text-[#ff0000] w-[200px] p-[1.5rem] bg-[rgb(0,128,255)]">custom</div>`;
    const result = await convert(source, "test.tsx");

    await expect(result.css).toMatchFileSnapshot(
      resolve(FIXTURES, "arbitrary-values.css"),
    );
    await expect(result.component).toMatchFileSnapshot(
      resolve(FIXTURES, "arbitrary-values.component.tsx"),
    );
  });
});

describe("regression baseline - custom variant single", () => {
  it("captures css and component output", async () => {
    const source = `<div className="bg-blue-500 ui-checked:bg-green-500">test</div>`;
    const result = await convert(source, "test.tsx", {
      customVariants: "@custom-variant ui-checked (&[ui-checked]);",
    });

    await expect(result.css).toMatchFileSnapshot(
      resolve(FIXTURES, "custom-variant-single.css"),
    );
    await expect(result.component).toMatchFileSnapshot(
      resolve(FIXTURES, "custom-variant-single.component.tsx"),
    );
  });
});

describe("regression baseline - custom variants QDS pattern", () => {
  it("captures css and component output", async () => {
    const source = `<div className="ui-checked:bg-blue-500 ui-disabled:opacity-50 ui-mixed:bg-purple-500">test</div>`;
    const result = await convert(source, "test.tsx", {
      customVariants: `
        @custom-variant ui-checked (&[ui-checked]);
        @custom-variant ui-disabled (&[ui-disabled]);
        @custom-variant ui-mixed (&[ui-mixed]);
      `,
    });

    await expect(result.css).toMatchFileSnapshot(
      resolve(FIXTURES, "custom-variants-qds.css"),
    );
    await expect(result.component).toMatchFileSnapshot(
      resolve(FIXTURES, "custom-variants-qds.component.tsx"),
    );
  });
});

describe("regression baseline - custom variant stacked with hover", () => {
  it("captures css and component output", async () => {
    const source = `<button className="ui-checked:hover:bg-blue-700">click</button>`;
    const result = await convert(source, "test.tsx", {
      customVariants: { "ui-checked": "&[ui-checked]" },
    });

    await expect(result.css).toMatchFileSnapshot(
      resolve(FIXTURES, "custom-variant-stacked-hover.css"),
    );
    await expect(result.component).toMatchFileSnapshot(
      resolve(FIXTURES, "custom-variant-stacked-hover.component.tsx"),
    );
  });
});

describe("regression baseline - theme input", () => {
  it("captures css, component, and themeCss output", async () => {
    const source = `<div className="bg-brand p-4">hi</div>`;
    const result = await convert(source, "test.tsx", {
      themeCss: "@theme { --color-brand: #ff0000; }",
    });

    await expect(result.css).toMatchFileSnapshot(
      resolve(FIXTURES, "theme-input.css"),
    );
    await expect(result.component).toMatchFileSnapshot(
      resolve(FIXTURES, "theme-input.component.tsx"),
    );
    await expect(result.themeCss).toMatchFileSnapshot(
      resolve(FIXTURES, "theme-input.themeCss"),
    );
  });
});

describe("regression baseline - CSS Modules output", () => {
  it("captures css, component, and classMap output", async () => {
    const source = `<div className="flex items-center p-4"><span className="text-sm font-bold">label</span></div>`;
    const result = await convert(source, "test.tsx", {
      outputFormat: "css-modules",
    });

    await expect(result.css).toMatchFileSnapshot(
      resolve(FIXTURES, "css-modules.css"),
    );
    await expect(result.component).toMatchFileSnapshot(
      resolve(FIXTURES, "css-modules.component.tsx"),
    );
    await expect(JSON.stringify(result.classMap, null, 2)).toMatchFileSnapshot(
      resolve(FIXTURES, "css-modules.classMap.json"),
    );
  });
});

describe("regression baseline - full checkbox fixture", () => {
  it("captures css and component output", async () => {
    const source = await readFile(
      resolve(__dirname, "../../fixtures/checkbox.tsx"),
      "utf-8",
    );
    const result = await convert(source, "checkbox.tsx", {
      customVariants: `
        @custom-variant ui-checked (&[ui-checked]);
        @custom-variant ui-disabled (&[ui-disabled]);
        @custom-variant ui-mixed (&[ui-mixed]);
      `,
    });

    await expect(result.css).toMatchFileSnapshot(
      resolve(FIXTURES, "checkbox-full.css"),
    );
    await expect(result.component).toMatchFileSnapshot(
      resolve(FIXTURES, "checkbox-full.component.tsx"),
    );
  });
});

describe("regression baseline - unmatched and dynamic class warnings", () => {
  it("captures unmatched class warnings", async () => {
    const source = `<div className="flex not-a-real-class another-fake">test</div>`;
    const result = await convert(source, "test.tsx");

    await expect(JSON.stringify(result.warnings, null, 2)).toMatchFileSnapshot(
      resolve(FIXTURES, "unmatched-warnings.json"),
    );
  });

  it("captures dynamic class warnings", async () => {
    const source = `<div className={active ? "bg-blue-500" : "bg-gray-500"}>toggle</div>`;
    const result = await convert(source, "test.tsx");

    await expect(JSON.stringify(result.warnings, null, 2)).toMatchFileSnapshot(
      resolve(FIXTURES, "dynamic-class-warnings.json"),
    );
  });
});

describe("regression baseline - class attribute (Qwik/Solid)", () => {
  it("captures css and component output", async () => {
    const source = `<div class="flex items-center gap-2"><span class="text-sm font-semibold">Label</span></div>`;
    const result = await convert(source, "test.tsx");

    await expect(result.css).toMatchFileSnapshot(
      resolve(FIXTURES, "class-attribute.css"),
    );
    await expect(result.component).toMatchFileSnapshot(
      resolve(FIXTURES, "class-attribute.component.tsx"),
    );
  });
});

describe("regression baseline - no classes (edge case)", () => {
  it("captures css and component output", async () => {
    const source = `<div id="test"><span>no classes</span></div>`;
    const result = await convert(source, "test.tsx");

    await expect(result.css).toMatchFileSnapshot(
      resolve(FIXTURES, "no-classes.css"),
    );
    await expect(result.component).toMatchFileSnapshot(
      resolve(FIXTURES, "no-classes.component.tsx"),
    );
  });
});

describe("regression baseline - theme warning paths", () => {
  it("captures malformed theme declaration warnings", async () => {
    const source = `<div className="flex p-4">test</div>`;
    const result = await convert(source, "test.tsx", {
      themeCss: "@theme { not-a-declaration; }",
    });

    await expect(JSON.stringify(result.warnings, null, 2)).toMatchFileSnapshot(
      resolve(FIXTURES, "theme-parse-error-warnings.json"),
    );
  });

  it("captures unsupported theme reset warnings", async () => {
    const source = `<div className="flex p-4">test</div>`;
    const result = await convert(source, "test.tsx", {
      themeCss: "@theme { --color-brand: initial; }",
    });

    await expect(JSON.stringify(result.warnings, null, 2)).toMatchFileSnapshot(
      resolve(FIXTURES, "theme-reset-warnings.json"),
    );
  });

  it("captures unknown theme namespace warnings", async () => {
    const source = `<div className="flex">hi</div>`;
    const result = await convert(source, "test.tsx", {
      themeCss: "@theme { --unknown-thing: value; }",
    });

    await expect(JSON.stringify(result.warnings, null, 2)).toMatchFileSnapshot(
      resolve(FIXTURES, "theme-unknown-namespace-warnings.json"),
    );
  });
});
