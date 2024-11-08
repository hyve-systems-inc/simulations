module.exports = {
  extension: ["ts"],
  spec: "src/models/**/*.spec.ts",
  require: ["ts-node/register"],
  loader: "ts-node/esm",
};
