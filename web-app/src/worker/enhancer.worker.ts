/// <reference lib="webworker" />

import * as tf from '@tensorflow/tfjs';
import { VERTEX_SHADER, FRAGMENT_SHADER } from '../gl/shaders';

let model: tf.LayersModel | null = null;

interface GLContext {
  canvas: OffscreenCanvas;
  gl: WebGL2RenderingContext;
  program: WebGLProgram;
}

function denormalizeParams(predicted: number[]): { brightness: number; contrast: number; saturation: number } {
  let brightness = predicted[0] / 2.0;
  let contrast = predicted[1] * (1.5 / 2.0) + 1.0;
  let saturation = predicted[2] * (1.5 / 2.0) + 1.0;
  
  brightness = Math.max(-0.4, Math.min(0.4, brightness));
  contrast = Math.max(0.6, Math.min(1.5, contrast));
  saturation = Math.max(0.7, Math.min(1.5, saturation)); 
  
  return { brightness, contrast, saturation };
}

function initGL(width: number, height: number): GLContext {
  console.log('Инициализация WebGL:', width, 'x', height);
  const canvas = new OffscreenCanvas(width, height);
  const glContext = canvas.getContext('webgl2');
  
  if (!glContext) {
    throw new Error('WebGL2 not supported');
  }
  
  const gl = glContext;

  const vs = gl.createShader(gl.VERTEX_SHADER);
  if (!vs) throw new Error('Failed to create vertex shader');
  gl.shaderSource(vs, VERTEX_SHADER);
  gl.compileShader(vs);

  const fs = gl.createShader(gl.FRAGMENT_SHADER);
  if (!fs) throw new Error('Failed to create fragment shader');
  gl.shaderSource(fs, FRAGMENT_SHADER);
  gl.compileShader(fs);

  const program = gl.createProgram();
  if (!program) throw new Error('Failed to create program');
  gl.attachShader(program, vs);
  gl.attachShader(program, fs);
  gl.linkProgram(program);

  gl.useProgram(program);

  const posBuffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, posBuffer);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1,-1, 1,-1, -1,1, 1,1]), gl.STATIC_DRAW);
  
  const posLoc = gl.getAttribLocation(program, 'a_position');
  gl.enableVertexAttribArray(posLoc);
  gl.vertexAttribPointer(posLoc, 2, gl.FLOAT, false, 0, 0);

  return { canvas, gl, program };
}

async function loadModel(): Promise<void> {
  console.log('Загрузка обученной модели');
  if (!model) {
    try {
      console.log('Попытка загрузки модели');
      model = await tf.loadLayersModel('/image-developer/web_model/model.json');
      console.log('LayersModel загружена успешно');
      console.log('Информация о модели:', model.inputs, model.outputs);
    } catch (error) {
      console.error('Ошибка загрузки LayersModel:', error);
      throw error;
    }
  }
}

self.onmessage = async (e: MessageEvent<any>) => {
  console.log('Worker получил сообщение:', e.data.action, 'Task:', e.data.taskId);
  
  const { taskId, action, imageBitmap } = e.data;

  if (action === 'INIT') {
    console.log('Инициализация');
    try {
      await loadModel();
      console.log('INIT завершен');
      self.postMessage({ taskId, status: 'READY' });
    } catch (error) {
      console.error('Ошибка INIT:', error);
      self.postMessage({ taskId, status: 'ERROR', error: (error as Error).message });
    }
    return;
  }

  if (action === 'PROCESS') {
    console.log('Начало обработки');
    try {
      self.postMessage({ taskId, status: 'PROCESSING', progress: 10 });
      
      await loadModel();
      self.postMessage({ taskId, status: 'PROCESSING', progress: 20 });

      console.log('Создание thumbnail');
      const thumbCanvas = new OffscreenCanvas(128, 128);
      const ctx = thumbCanvas.getContext('2d');
      
      if (!ctx) {
        throw new Error('Failed to get 2D context');
      }
      
      ctx.drawImage(imageBitmap, 0, 0, 128, 128);
      self.postMessage({ taskId, status: 'PROCESSING', progress: 30 });
      
      const imageData = ctx.getImageData(0, 0, 128, 128);
      const thumbTensor = tf.browser.fromPixels(imageData).expandDims(0).div(255.0);
      self.postMessage({ taskId, status: 'PROCESSING', progress: 40 });

      console.log('Запуск инференса');
      const prediction = model!.predict(thumbTensor) as tf.Tensor;
      const paramsData = await prediction.data();
      const rawParams = Array.from(paramsData) as number[];
      
      const safeParams = denormalizeParams(rawParams);
      console.log('параметры от ИИ:', rawParams);
      console.log('Безопасные параметры для WebGL:', safeParams);
      self.postMessage({ taskId, status: 'PROCESSING', progress: 50 });
      
      thumbTensor.dispose();
      prediction.dispose();

      console.log('Инициализация WebGL');
      const { canvas, gl, program } = initGL(imageBitmap.width, imageBitmap.height);
      self.postMessage({ taskId, status: 'PROCESSING', progress: 60 });
      
      console.log('Создание текстуры');
      const texture = gl.createTexture();
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, texture);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, imageBitmap);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      
      gl.uniform1i(gl.getUniformLocation(program, 'u_image'), 0);
      
      gl.uniform1f(gl.getUniformLocation(program, 'u_brightness'), safeParams.brightness);
      gl.uniform1f(gl.getUniformLocation(program, 'u_contrast'), safeParams.contrast);
      gl.uniform1f(gl.getUniformLocation(program, 'u_saturation'), safeParams.saturation);

      self.postMessage({ taskId, status: 'PROCESSING', progress: 80 });

      console.log('Рендеринг');
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
      self.postMessage({ taskId, status: 'PROCESSING', progress: 90 });

      console.log('Конвертация в Blob');
      const blob = await (canvas as any).convertToBlob({ type: 'image/jpeg', quality: 0.92 });
      console.log('Blob создан:', blob.size, 'bytes');
      
      self.postMessage({ taskId, status: 'COMPLETED', progress: 100, result: blob });

    } catch (err) {
      console.error('Ошибка в PROCESS:', err);
      self.postMessage({ taskId, status: 'ERROR', progress: 0, error: (err as Error).message });
    }
  }
};