import { Context, h, Schema } from 'koishi'

export const name = 'imageSender'

export interface Config {
    prefix: string
    imageLibraryPath: string
    imageTypes: string[]
}

export const Config: Schema<Config> = Schema.object({
    prefix: Schema.string().default('#'),
    imageLibraryPath: Schema.string().default('./data/images/'),
    imageTypes: Schema.array(Schema.string()).default(['details', 'intro'])
})

export function apply(ctx: Context, config: Config) {
    ctx.middleware(async (session, next) => {
        if (session.content.startsWith(config.prefix)) {
            const productModel = session.content.slice(config.prefix.length).trim()
            if (/^[a-zA-Z0-9]+$/.test(productModel)) {
                for (const type of config.imageTypes) {
                    const imagePath = `${config.imageLibraryPath}/${type}/${productModel}.jpg`
                    try {
                        // 发送图片
                        session.send(h('image', { file: imagePath }))
                        return
                    } catch (error) {
                        // 如果文件不存在，继续尝试下一个类型
                        continue
                    }
                }
                session.send('未找到该产品的图片')
            } else {
                session.send('产品型号应由字母和数字构成')
            }
        }
        return next()
    })
}