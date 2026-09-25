export const plugin = {
  name: "broken",
  apply() {
    throw new Error("deliberately broken");
  },
};
