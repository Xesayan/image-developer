import heic2any from 'heic2any';

type TaskStatus = 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'ABORTED' | 'ERROR' | 'READY';
type EventCallback = (taskId: string, status: TaskStatus, progress: number) => void;

interface Task {
  id: string;
  status: TaskStatus;
  progress: number;
  result?: Blob;
}

export class ImageEnhancerAPI {
  private tasks: Map<string, Task> = new Map();
  private worker: Worker;
  private listeners: EventCallback[] = [];
  private isWorkerReady = false;
  private initPromise: Promise<void>;

  constructor() {
    this.worker = new Worker(new URL('../worker/enhancer.worker.ts', import.meta.url), { type: 'module' });
    this.worker.onmessage = this.handleWorkerMessage.bind(this);
    
    this.initPromise = new Promise((resolve) => {
      const checkReady = (e: MessageEvent) => {
        if (e.data.status === 'READY') {
          this.isWorkerReady = true;
          this.worker.removeEventListener('message', checkReady);
          resolve();
        }
      };
      this.worker.addEventListener('message', checkReady);
      this.worker.postMessage({ action: 'INIT' });
    });
  }

  public async submitTask(imageSource: File | string): Promise<string> {
    await this.initPromise;

    const taskId = crypto.randomUUID();
    this.tasks.set(taskId, { id: taskId, status: 'PENDING', progress: 0 });
    this.emit(taskId, 'PENDING', 0);

    this.processImage(taskId, imageSource);
    return taskId;
  }

  public getTaskStatus(taskId: string) {
    const t = this.tasks.get(taskId);
    return t ? { status: t.status, progress: t.progress } : null;
  }

  public abortTask(taskId: string): boolean {
  const task = this.tasks.get(taskId);
  if (task && (task.status === 'PENDING' || task.status === 'PROCESSING')) {
    console.log(`Прерывание задачи ${taskId}...`);
    this.worker.terminate();
    this.tasks.delete(taskId);
    this.emit(taskId, 'ABORTED', 0);
    return true;
  }
  return false;
}

public abortCurrentTask(): boolean {
  for (const [taskId, task] of this.tasks) {
    if (task.status === 'PENDING' || task.status === 'PROCESSING') {
      return this.abortTask(taskId);
    }
  }
  return false;
}

  public getResult(taskId: string): Blob | null {
    return this.tasks.get(taskId)?.result || null;
  }

  public onStatusChange(cb: EventCallback) {
    this.listeners.push(cb);
  }

  private async processImage(taskId: string, source: File | string) {
    try {
      let blob: Blob;
      if (typeof source === 'string') {
        blob = await (await fetch(source)).blob();
      } else {
        blob = source;
      }

      if (blob.type === 'image/heic' || blob.type === 'image/heif') {
        // @ts-ignore
        blob = await heic2any({ blob, toType: "image/jpeg" });
      }

      const imageBitmap = await createImageBitmap(blob);
      
      this.worker.postMessage({ taskId, action: 'PROCESS', imageBitmap }, [imageBitmap]);
      
    } catch (err) {
      const t = this.tasks.get(taskId);
      if (t) {
        t.status = 'ERROR';
        this.emit(taskId, 'ERROR', 0);
      }
    }
  }

  private handleWorkerMessage(e: MessageEvent) {
    const { taskId, status, progress, result } = e.data;
    const task = this.tasks.get(taskId);
    if (!task) return;

    task.status = status;
    task.progress = progress;
    if (result) task.result = result;

    this.emit(taskId, status, progress);
  }

  private emit(taskId: string, status: TaskStatus, progress: number) {
    this.listeners.forEach(cb => cb(taskId, status, progress));
  }
}