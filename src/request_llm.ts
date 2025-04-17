import fs, { readFileSync } from 'fs';
import path from 'path';
import { Session, Context, h, Schema } from "koishi";
import { readFile } from 'fs/promises'
import axios from 'axios'
import { Config } from '.';

interface AIMessage {
    role: 'system' | 'user' | 'assistant'
    content: string
}

interface APIRequest {
    model: string
    messages: AIMessage[]
    temperature?: number
    max_tokens?: number
}

export async function getAIResponse(
    ctx: Context,
    options: {
        apiUrl: string
        apiKey: string
        modelName: string
        rolePath: string
        productPath: string
        chainPath: string
        user_prompt: string
    }
): Promise<any> {
    try {
        // 异步读取配置文件 productConfig,
        const [roleConfig, chainConfig] = await Promise.all([
            readFile(options.rolePath, 'utf-8'),
            //readFile(options.productPath, 'utf-8'),
            readFile(options.chainPath, 'utf-8')
        ])

        // 解析 JSON 配置
        const systemRole: AIMessage = JSON.parse(roleConfig)
        const productInfo: string = readFileSync(options.productPath, "utf-8")
        const chainOfThought: AIMessage = JSON.parse(chainConfig)

        // 构造请求消息
        const requestBody: APIRequest = {
            model: options.modelName,
            messages: [
                { role: 'system', content: systemRole.content },
                { role: 'system', content: `<product_intro>${productInfo}<product_intro/>` },
                {
                    role: "system", content: `<thinking_format>[你必须先思考,并在回复的<thinking>标签内使用中文输出每一点及其根据或不明的点]'<thinking>${chainOfThought}<thinking/><Assistant执行思考规则>\n- 必须在每次回复开始时执行完整思维链过程。\n- 在每轮思考开始时，明确提醒自己这是新一轮思考。\n- 用<thinking>标签将思考过程分列包裹起来。\n</Assistant执行思考规则>\n##\n##\nNote: \n- 以下是输出<thinking>时的格式，Assistant需要将<thinking>中的要求按照顺序填写，再输出答案\n- 每个思考点都应该列出，禁止跳过或者合并任何一个问题，请给出完美的答案，并用中文输出。\n<Correct_information>\n1.\n2.\n3.\n4.\n5.：\n</Correct_information>\n##\n</thinking_format>`
                },
                { role: "user", content: options.user_prompt }
            ],
            temperature: 0.6,
            max_tokens: 4096
        }

        // 发送 API 请求
        const response = await axios.post(options.apiUrl, requestBody, {
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${options.apiKey}`
            },
            timeout: 30000
        })

        if (response.status !== 200) {
            throw new Error(`API 请求失败: ${response.statusText}`)
        }

        // 构造完整响应对象
        const aiReply = {
            timestamp: new Date().toISOString(),
            request: requestBody,
            response: response.data
        }

        // 记录到 Koishi 日志
        ctx.logger('ai').info(JSON.stringify(aiReply))

        return aiReply
    } catch (error) {
        ctx.logger('ai').error(`AI 请求错误: ${error.message}`)
        throw new Error(`AI 处理失败: ${error.message}`)
    }
}

function removeContentBeforeThinkingTag(input: string): string {
    const tag = '</thinking>';
    const tagIndex = input.indexOf(tag);

    if (tagIndex === -1) {
        return input; // 如果不存在标签，返回原字符串
    }

    // 截取标签之后的内容
    return input.substring(tagIndex + tag.length);
}


export async function prest_chat(ctx: Context, session: Session, config: Config, konwCode: string) {
    const konwPath = path.resolve(config.konwBasePath, konwCode + ".json")
    var user_prompt = ""
    if (session.content.length < 6) {
        user_prompt = "请帮助一线销售人员，推介该产品，多介绍一些有吸引力的话术。"
    } else {
        user_prompt = session.content
    }


    try {
        const response = await getAIResponse(ctx, {
            apiUrl: config.llm_api_url,
            apiKey: config.llm_api_key,
            modelName: config.llm_model_name,
            rolePath: config.presetPath,
            productPath: konwPath,
            chainPath: './data/wjl/preset/cot.json',
            user_prompt: user_prompt
        })
        const result = removeContentBeforeThinkingTag(response.response.choices[0].message.content)
        await session.send(result)
        return result
    } catch (error) {
        return `请求失败: ${error.message}`
    }
}
