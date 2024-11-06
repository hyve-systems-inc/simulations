module.exports = {
  extension: ["ts"],
  spec: "src/cube/modelV2/**/*.spec.ts",
  require: ["ts-node/register"],
  loader: "ts-node/esm",
};
