export function deployedServiceUrl(output, workerName) {
  const clean = output.replace(/\u001b\[[0-9;]*m/g, "");
  const urls = clean.match(/https:\/\/[a-z0-9.-]+\.workers\.dev\b/gi) || [];
  const actual = urls.find((value) =>
    new URL(value).hostname.startsWith(`${workerName}.`),
  );
  if (!actual)
    throw Error(
      "Cloudflare did not return a published Worker URL; frontend configuration was not changed",
    );
  return new URL(actual).origin;
}
