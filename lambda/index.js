const { S3Client, GetObjectCommand } = require("@aws-sdk/client-s3");
const sharp = require("sharp");

const s3 = new S3Client({});

const FORMAT_TYPES = {
  jpeg: "image/jpeg",
  jpg: "image/jpeg",
  webp: "image/webp",
  png: "image/png",
  avif: "image/avif",
};

exports.handler = async (event) => {
  const key = (event.rawPath || "/").replace(/^\//, "");

  if (!key) {
    return {
      statusCode: 400,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ error: "Missing image path" }),
    };
  }

  const MAX_DIMENSION = 4096;

  const params = event.queryStringParameters || {};
  const width = params.w ? parseInt(params.w, 10) : null;
  const height = params.h ? parseInt(params.h, 10) : null;
  const format = params.f && FORMAT_TYPES[params.f] ? params.f : null;
  const quality = params.q
    ? Math.min(Math.max(parseInt(params.q, 10), 1), 100)
    : 80;

  if ((width !== null && width > MAX_DIMENSION) || (height !== null && height > MAX_DIMENSION)) {
    return {
      statusCode: 400,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ error: `Dimensions may not exceed ${MAX_DIMENSION}px` }),
    };
  }

  try {
    const response = await s3.send(
      new GetObjectCommand({
        Bucket: process.env.BUCKET,
        Key: key,
      }),
    );

    const imageBuffer = Buffer.from(await response.Body.transformToByteArray());

    let pipeline = sharp(imageBuffer);

    if (width || height) {
      pipeline = pipeline.resize(width, height, {
        fit: "inside",
        withoutEnlargement: true,
      });
    }

    const outputFormat = format || "jpeg";
    pipeline = pipeline.toFormat(outputFormat, { quality });

    const outputBuffer = await pipeline.toBuffer();

    return {
      statusCode: 200,
      headers: {
        "Content-Type": FORMAT_TYPES[outputFormat],
        "Cache-Control": "public, max-age=31536000, immutable",
      },
      body: outputBuffer.toString("base64"),
      isBase64Encoded: true,
    };
  } catch (err) {
    if (err.name === "NoSuchKey") {
      return {
        statusCode: 404,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ error: "Image not found" }),
      };
    }

    console.error("Processing error:", err);
    return {
      statusCode: 500,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ error: "Internal server error" }),
    };
  }
};
