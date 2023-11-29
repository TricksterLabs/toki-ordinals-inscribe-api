import fs from 'fs';
import { logger } from './logger.js'

export async function readJsonFile(filename) {
  try {
    const data = await fs.promises.readFile(filename);
    const jsonArray = JSON.parse(data);
    return jsonArray;
  } catch (err) {
    logger.error(err);
    return null;
  }
}

export async function writeJsonFile(filename, jsonArray) {
  try {
    const jsonData = JSON.stringify(jsonArray, null, 2);
    await fs.promises.writeFile(filename, jsonData);
    logger.log(`Data written to ${filename}`);
  } catch (err) {
    logger.error(err);
  }
}