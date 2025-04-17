//import sharp from 'sharp';
import fs from 'fs';
import path from 'path';
import { Session, Context, h, Schema } from "koishi";
import { createCanvas, loadImage } from 'canvas';

export async function sendLongImage(session: Session, imagePath: string, chunkHeight: number = 800, area: string = "") {
    try {
        // 加载图片
        const image = await loadImage(imagePath);
        const { width, height } = image;

        // 计算分块数量
        const chunkCount = Math.ceil(height / chunkHeight);

        // 创建画布并发送分块图片
        for (let i = 0; i < chunkCount; i++) {
            const canvas = createCanvas(width, chunkHeight);
            const ctx = canvas.getContext('2d');
            const y = i * chunkHeight;

            // 绘制图片分块
            ctx.drawImage(image, 0, y, width, chunkHeight, 0, 0, width, chunkHeight);
            // 将画布转换为图片并发送
            const imageBuffer = canvas.toBuffer('image/png');
            //if (session.guild) { session.bot.sendPrivateMessage(session.userId, h.image(imageBuffer, 'image/png')); } else {
            session.send(h.image(imageBuffer, 'image/png'));
            //}
        }
    } catch (error) {
        console.error('发送长图失败：', error);
        await session.send('图片发送失败，请稍后再试');
    }
}