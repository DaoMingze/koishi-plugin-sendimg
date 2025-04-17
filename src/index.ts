import { Context, h, Session, Schema, segment } from 'koishi'
import path from "path";
import fs from "fs";
import { stat } from 'fs/promises'
import { pathToFileURL } from 'url'
import { sendLongImage } from './img_chunks'
import { prest_chat } from './request_llm'

export const name = "sendimg"
export const usage = "发送图片"

export interface Config {
    imageBasePath: string; // 图床路径
    prefix: string; // 消息前缀
    keywordJsonPath: string; // 关键词 JSON 文件路径
    presetPath: string;
    konwBasePath: string;
    llm_api_url: string;
    llm_api_key: string;
    llm_model_name: string;
}

export const Config: Schema<Config> = Schema.object({
    imageBasePath: Schema.string().description("图床路径").default("./data/images"),
    prefix: Schema.string().description("消息前缀").default("#"),
    keywordJsonPath: Schema.string()
        .description("关键词 JSON 文件路径")
        .default("./data/keywords.json"),
    presetPath: Schema.string().description("角色预设文件路径").default("./data"),
    konwBasePath: Schema.string().description("知识库路径").default("./data/repo"),
    llm_api_url: Schema.string().description("LLM API提供商URL").default("https://open.bigmodel.cn/api/paas/v4/chat/completions"),
    llm_api_key: Schema.string().description("LLM API KEY").default(""),
    llm_model_name: Schema.string().description("LLM API调用模型").default("glm-4-flash"),
});

export async function send_img(ctx: Context, session: Session, imagePath: string, imageFileName: string) {
    try {
        // 检查图片是否存在
        if (!fs.existsSync(imagePath)) {
            ctx.logger.warn(`图片文件不存在: ${imagePath}`);
            return;
        }
        const { size: fileSize } = await stat(imagePath)
        const platformLimit = session.bot.internal.getFileSizeLimit?.() || 1024 * 1024
        if (fileSize > platformLimit) {
            sendLongImage(session, imagePath, 1024)
            session.send('检测到图片较大，已自动拆分发送')
        } else {
            // 直接发送原始图片
            await session.send(`<image file=${imagePath} />`)
            const imageBuffer = fs.readFileSync(imagePath);
            const base64 = imageBuffer.toString("base64");
            await session.send(h('image', { url: 'data:image/png;base64,' + base64 }));
            // await session.send(
            //     `产品详情图\n路径为${imagePath}` + h.image(imageBuffer, 'image/jpeg')
            // );
            await session.send(h('image', {
                file: fs.createReadStream(imagePath),
                filename: imageFileName,  // 明确指定文件名（避免路径中的特殊字符）
            }))
        }
    } catch (err) {
        ctx.logger.error(`发送图片失败: ${err}`);
    }
}


export function apply(ctx: Context, config: Config) {
    const keywordJsonPath = path.resolve(ctx.baseDir, config.keywordJsonPath);
    let keywords: { [key: string]: string } = {};
    try {
        const keywordJson = fs.readFileSync(keywordJsonPath, "utf-8");
        keywords = JSON.parse(keywordJson);
    } catch (err) {
        ctx.logger.error(`读取关键词 JSON 文件失败: ${err}`);
    }
    // 监听群聊消息
    ctx.middleware(async (session, next) => {
        // 仅在群聊环境处理
        // 匹配 # 开头的指令
        const command = session.content.match(/#([\da-zA-Z]{2,4})/)

        if (!command) return next()
        // 提取指令参数（如 a2）
        const [_, code] = command
        const imageFileName = keywords[code];
        if (!imageFileName) { session.send("无匹配型号，请检查大小写和易混字符，重新输入") } else {
            const userId = session.userId
            const imageUrl = path.resolve(
                ctx.baseDir,
                config.imageBasePath,
                imageFileName
            );
            if (session.content.length < 6) {
                if (session.guild) {
                    try {
                        // 发送私聊图片
                        //+ h.image(pathToFileURL(path.resolve(imageUrl)).href)
                        send_img(ctx, session, imageUrl, imageFileName)
                        // 群聊回复
                        session.send(`产品匹配成功，已通过私聊发送【${code}】相关图片，请您查收~\n如果发送失败，请在私聊继续沟通。`)

                        prest_chat(ctx, session, config, code)
                    } catch (error) {
                        await session.send('图片发送失败，请确保已添加机器人好友~')
                    }
                } else {
                    const messageFlag = await session.send("发送中")
                    //session.send(h.image(pathToFileURL(path.resolve(imageUrl)).href))
                    send_img(ctx, session, imageUrl, imageFileName)
                    prest_chat(ctx, session, config, code)
                    session.bot.deleteMessage(session.channelId, messageFlag[0])
                }
            } else { prest_chat(ctx, session, config, code) }
        }
    })
}