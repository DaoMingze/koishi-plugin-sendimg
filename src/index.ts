import { Context, h, Schema } from 'koishi';
import fs from 'fs';
import path from 'path';
const koishi_1 = require("koishi");

export interface Config {
    imageBasePath: string; // 图床路径
    prefix: string; // 消息前缀
    keywordJsonPath: string; // 关键词 JSON 文件路径
}

export const Config: Schema<Config> = Schema.object({
    imageBasePath: Schema.string().description('图床路径').default('./data/wjl'),
    prefix: Schema.string().description('消息前缀').default('小乐'),
    keywordJsonPath: Schema.string().description('关键词 JSON 文件路径').default('./data/keywords.json'),
});

export function apply(ctx: Context, config: Config) {
    // 读取关键词 JSON 文件（使用 Koishi 数据目录解析路径）
    const keywordJsonPath = path.resolve(ctx.baseDir, config.keywordJsonPath);
    let keywords: { [key: string]: string } = {};
    try {
        const keywordJson = fs.readFileSync(keywordJsonPath, 'utf-8');
        keywords = JSON.parse(keywordJson);
    } catch (err) {
        ctx.logger.error(`读取关键词 JSON 文件失败: ${err}`);
    }

    // 监听消息事件
    ctx.on('message', async (session) => {
        // 检查消息是否以指定前缀开头
        if (!session.content.startsWith(config.prefix)) return;

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

        // 检查图片是否存在
        if (!fs.existsSync(imagePath)) {
            ctx.logger.warn(`图片文件不存在: ${imagePath}`);
            return;
        }

        try {

            const imageBuffer = fs.readFileSync(imagePath);
            //await session.send(h.image(imageBuffer, 'image/jpeg'));
            //await session.send(`您要的是：${imageFileName}\n` + h.image(imagePath))
            // 读取图片并转换为 base64
            const base64 = imageBuffer.toString('base64')
            await session.send(h('image', { url: 'data:image/png;base64,' + base64 }));
            //await session.send(h('image', { file: imagePath }));  session TypeError: Cannot read properties of undefined (reading 'startsWith')
            //await session.send('图片：\n' + koishi_1.h.image(imagePath)); session Error: fetch d:\coding\koishi-app\data\wjl\details\A2W-detail.jpg failed
        } catch (err) {
            ctx.logger.error(`发送图片失败: ${err}`);
        }
    });
}