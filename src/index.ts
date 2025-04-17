import { Context, h, Schema } from "koishi";
import fs from "fs";
import { stat } from 'fs/promises'
import path, { toNamespacedPath } from "path";
import { sendLongImage } from './img_chunks';
import { pathToFileURL } from 'url'


export const name = 'koishi-plugin-sendimg'
namespace Sendimg {

    export interface Config {
        imageBasePath: string; // 图床路径
        prefix: string; // 消息前缀
        keywordJsonPath: string; // 关键词 JSON 文件路径
    }

    export const Config: Schema<Config> = Schema.object({
        imageBasePath: Schema.string().description("图床路径").default("./data/images"),
        prefix: Schema.string().description("消息前缀").default("#"),
        keywordJsonPath: Schema.string()
            .description("关键词 JSON 文件路径")
            .default("./data/keywords.json"),
    });
}

export default Sendimg

export function apply(ctx: Context, config: Sendimg.Config) {
    // 读取关键词 JSON 文件（使用 Koishi 数据目录解析路径）
    const keywordJsonPath = path.resolve(ctx.baseDir, config.keywordJsonPath);
    let keywords: { [key: string]: string } = {};
    try {
        const keywordJson = fs.readFileSync(keywordJsonPath, "utf-8");
        keywords = JSON.parse(keywordJson);
    } catch (err) {
        ctx.logger.error(`读取关键词 JSON 文件失败: ${err}`);
    }

    // 监听消息事件
    ctx.on('message', async (session) => {
        // 检查消息是否以指定前缀开头

        if (!session.content.startsWith(config.prefix)) return;
        session.send(`${session.content},${config.prefix}`)
        // 去掉前缀获取关键词
        const userKeyword = session.content.slice(config.prefix.length).trim();
        // 查找对应的图片文件名
        const imageFileName = keywords[userKeyword];
        if (!imageFileName) return;

        // 解析图片绝对路径（使用 Koishi 数据目录）
        const imagePath = path.resolve(
            ctx.baseDir,
            config.imageBasePath,
            imageFileName
        );
        try {
            // 检查图片是否存在
            if (!fs.existsSync(imagePath)) {
                ctx.logger.warn(`图片文件不存在: ${imagePath}`);
                return;
            }
            const { size: fileSize } = await stat(imagePath)
            const platformLimit = session.bot.internal.getFileSizeLimit?.() || 1024 * 1024
            if (fileSize > platformLimit) {
                sendLongImage(session, imagePath, 2048)
                session.send('检测到图片较大，已自动拆分发送')
            } else {
                // 直接发送原始图片
                await session.send(`<image file=${imagePath} />`)
                const imageBuffer = fs.readFileSync(imagePath);
                const base64 = imageBuffer.toString("base64");
                await session.send(h('image', { url: 'data:image/png;base64,' + base64 }));
                await session.send(
                    `产品详情图\n路径为${imagePath}` + h.image(imageBuffer, 'image/jpeg')
                );
                await session.send(h('image', {
                    file: fs.createReadStream(imagePath),
                    filename: imageFileName,  // 明确指定文件名（避免路径中的特殊字符）
                }))
            }
        } catch (err) {
            ctx.logger.error(`发送图片失败: ${err}`);
        }
    })
}
