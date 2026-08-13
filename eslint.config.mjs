import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTypescript from "eslint-config-next/typescript";

export default defineConfig([
  ...nextVitals,
  ...nextTypescript,
  // .deploy 是发布时打的产物快照(内含各 release 的 .next 编译结果),
  // 不忽略的话 lint 会去扫上百兆的压缩产物,报出上万条无意义的告警。
  globalIgnores([".next/**", "node_modules/**", "drizzle/**", "xiudou.site_nginx/**", ".deploy/**"]),
  {
    rules: {
      "no-restricted-syntax": [
        "error",
        {
          selector: "CallExpression[callee.name='revalidateTag'][arguments.length=1]",
          message: "revalidateTag 必须显式传入第二个参数。",
        },
      ],
    },
  },
]);
