import { ImageEnhancerAPI } from './api/ImageEnhancerAPI';

document.addEventListener('DOMContentLoaded', () => {
  const api = new ImageEnhancerAPI();
  let currentTaskId: string | null = null;

  const fileInput = document.getElementById('fileInput') as HTMLInputElement;
  const dropZone = document.getElementById('dropZone') as HTMLDivElement;
  const statusArea = document.getElementById('statusArea') as HTMLDivElement;
  const statusText = document.getElementById('statusText') as HTMLDivElement;
  const statusPercent = document.getElementById('statusPercent') as HTMLDivElement;
  const progressFill = document.getElementById('progressFill') as HTMLDivElement;
  const resultsArea = document.getElementById('resultsArea') as HTMLDivElement;
  const originalImg = document.getElementById('originalImg') as HTMLImageElement;
  const resultImg = document.getElementById('resultImg') as HTMLImageElement;
  const resetBtn = document.getElementById('resetBtn') as HTMLButtonElement;
  const cancelBtn = document.getElementById('cancelBtn') as HTMLButtonElement;

  if (!fileInput || !dropZone || !statusArea) {
    console.error('Не найдены необходимые HTML элементы');
    return;
  }

  dropZone.addEventListener('dragover', (e) => {
    e.preventDefault();
    dropZone.classList.add('drag-over');
  });

  dropZone.addEventListener('dragleave', () => {
    dropZone.classList.remove('drag-over');
  });

  dropZone.addEventListener('drop', (e) => {
    e.preventDefault();
    dropZone.classList.remove('drag-over');
    if (e.dataTransfer.files.length) {
      fileInput.files = e.dataTransfer.files;
      handleFile(fileInput.files[0]);
    }
  });

  fileInput.addEventListener('change', (e) => {
    if (fileInput.files?.[0]) {
      handleFile(fileInput.files[0]);
    }
  });

  if (cancelBtn) {
    cancelBtn.addEventListener('click', () => {
      if (currentTaskId) {
        console.log(' Пользователь отменил обработку');
        api.abortTask(currentTaskId);
        
        dropZone.style.display = 'block';
        statusArea.style.display = 'none';
        resultsArea.style.display = 'none';
        progressFill.style.width = '0%';
        currentTaskId = null;
      }
    });
  }

  if (resetBtn) {
    resetBtn.addEventListener('click', () => {
      fileInput.value = '';
      dropZone.style.display = 'block';
      statusArea.style.display = 'none';
      resultsArea.style.display = 'none';
      progressFill.style.width = '0%';
      currentTaskId = null;
    });
  }

  async function handleFile(file: File) {
    let processedFile = file;
    
    const isHeic = file.type === 'image/heic' || 
                   file.type === 'image/heif' || 
                   file.name.toLowerCase().endsWith('.heic') || 
                   file.name.toLowerCase().endsWith('.heif');
    
    if (isHeic) {
      console.log('🔄 Конвертация HEIC в JPEG');
      if (statusText) statusText.innerText = 'Конвертация HEIC';
      if (statusArea) statusArea.style.display = 'block';
      if (dropZone) dropZone.style.display = 'none';
      
      try {
        const heic2any = await import('heic2any');
        const jpegBlob = await heic2any.default({
          blob: file,
          toType: 'image/jpeg',
          quality: 0.9
        }) as Blob;
        
        processedFile = new File([jpegBlob], file.name.replace(/\.(heic|heif)$/i, '.jpg'), {
          type: 'image/jpeg'
        });
        
        console.log('HEIC сконвертирован в JPEG');
      } catch (err) {
        console.error('Ошибка конвертации HEIC:', err);
        alert('Ошибка конвертации HEIC файла.\nПопробуйте другой формат (JPG, PNG).');
        if (statusArea) statusArea.style.display = 'none';
        if (dropZone) dropZone.style.display = 'block';
        return;
      }
    }

    if (dropZone) dropZone.style.display = 'none';
    if (statusArea) statusArea.style.display = 'block';
    if (resultsArea) resultsArea.style.display = 'none';
    if (cancelBtn) cancelBtn.style.display = 'block';
    
    if (originalImg) {
      originalImg.src = URL.createObjectURL(processedFile);
    }

    try {
      currentTaskId = await api.submitTask(processedFile);
      console.log('Task ID:', currentTaskId);
    } catch (err) {
      console.error('Ошибка отправки:', err);
      if (statusText) {
        statusText.innerText = 'Ошибка';
        statusText.style.color = 'red';
      }
      currentTaskId = null;
    }
  }

  api.onStatusChange((taskId, status, progress) => {
    console.log('Status change:', status, progress);
    
    if (status === 'PENDING' || status === 'PROCESSING' || status === 'READY') {
      if (statusText) statusText.innerText = 'Обработка нейросетью';
      if (statusPercent) statusPercent.innerText = `${progress}%`;
      if (progressFill) progressFill.style.width = `${progress}%`;
      if (cancelBtn) cancelBtn.style.display = 'block';
    }

    if (status === 'COMPLETED') {
      const blob = api.getResult(taskId);
      if (blob && resultImg) {
        resultImg.src = URL.createObjectURL(blob);
        
        if (statusArea) statusArea.style.display = 'none';
        if (resultsArea) resultsArea.style.display = 'block';
        if (cancelBtn) cancelBtn.style.display = 'none';
      }
      currentTaskId = null;
    }
    
    if (status === 'ERROR') {
      if (statusText) {
        statusText.innerText = 'Произошла ошибка';
        statusText.style.color = '#ef4444';
      }
      if (cancelBtn) cancelBtn.style.display = 'none';
      currentTaskId = null;
    }
    
    if (status === 'ABORTED') {
      if (statusText) {
        statusText.innerText = 'Отменено пользователем';
        statusText.style.color = '#71717a';
      }
      if (dropZone) dropZone.style.display = 'block';
      if (statusArea) statusArea.style.display = 'none';
      if (cancelBtn) cancelBtn.style.display = 'none';
      currentTaskId = null;
    }
  });
});