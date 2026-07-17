import os
import numpy as np
import tensorflow as tf
from PIL import Image
import matplotlib.pyplot as plt
from datetime import datetime

print("=" * 60)
print(" ОЦЕНКА КАЧЕСТВА МОДЕЛИ НА РЕАЛЬНЫХ ИЗОБРАЖЕНИЯХ")
print("=" * 60)

print("\n1. Загрузка модели")
model = tf.keras.models.load_model('/tmp/enhancer_model/model.keras')
print("Модель загружена")

print("\n2. Формирование пула эталонных изображений")

image_folders = ['./images', '../images', '/tmp/images']
test_images = []

for folder in image_folders:
    if os.path.exists(folder):
        print(f"   Поиск в папке: {folder}")
        for filename in os.listdir(folder):
            if filename.lower().endswith(('.jpg', '.jpeg', '.png')) and '_enhanced' not in filename:
                filepath = os.path.join(folder, filename)
                test_images.append({
                    'path': filepath,
                    'name': filename
                })
            if len(test_images) >= 10:
                break
        if test_images:
            break

if not test_images:
    print("Не найдено изображений для тестирования")
    print("Добавьте фото в папку 'images' и запустите снова")
    exit(1)

print(f"Найдено {len(test_images)} изображений для тестирования")

os.makedirs('evaluation_results', exist_ok=True)
timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
results_dir = f'evaluation_results/run_{timestamp}'
os.makedirs(results_dir, exist_ok=True)

print("\n3. Обработка изображений моделью")
results = []

for i, img_info in enumerate(test_images):
    print(f"\n   [{i+1}/{len(test_images)}] Обработка: {img_info['name']}...")
    
    try:
        img = Image.open(img_info['path']).convert('RGB')
        original_size = img.size
        img_resized = img.resize((128, 128))
        img_array = np.array(img_resized, dtype=np.float32) / 255.0
        img_tensor = tf.expand_dims(img_array, 0)
        
        prediction = model.predict(img_tensor, verbose=0)[0]
        
        brightness = prediction[0] / 2.0
        contrast = prediction[1] * (1.5 / 2.0) + 1.0
        saturation = prediction[2] * (1.5 / 2.0) + 1.0
        
        brightness = np.clip(brightness, -0.4, 0.4)
        contrast = np.clip(contrast, 0.6, 1.5)
        saturation = np.clip(saturation, 0.7, 1.5)
        
        enhanced = img_array.copy()
        enhanced = np.clip(enhanced + brightness, 0, 1)
        mean = enhanced.mean()
        enhanced = np.clip((enhanced - mean) * contrast + mean, 0, 1)
        gray = np.mean(enhanced, axis=2, keepdims=True)
        enhanced = np.clip(gray + (enhanced - gray) * saturation, 0, 1)
        
        enhanced_uint8 = (enhanced * 255).astype(np.uint8)
        original_uint8 = (img_array * 255).astype(np.uint8)
        
        enhanced_full = Image.fromarray(enhanced_uint8).resize(original_size)
        enhanced_full.save(f'{results_dir}/{img_info["name"]}')
        
        results.append({
            'name': img_info['name'],
            'path': img_info['path'],
            'predicted_brightness': brightness,
            'predicted_contrast': contrast,
            'predicted_saturation': saturation,
            'original': img_array,
            'enhanced': enhanced
        })
        
        print(f"      Параметры: B={brightness:.3f}, C={contrast:.3f}, S={saturation:.3f}")
        
    except Exception as e:
        print(f"Ошибка: {e}")

print("\n4. Создание отчета")
if results:
    num_to_show = min(6, len(results))
    fig, axes = plt.subplots(num_to_show, 2, figsize=(10, 3 * num_to_show))
    
    if num_to_show == 1:
        axes = axes.reshape(1, -1)
    
    for i, result in enumerate(results[:num_to_show]):
        axes[i, 0].imshow(result['original'])
        axes[i, 0].set_title(f"Оригинал\n{result['name'][:30]}")
        axes[i, 0].axis('off')
        
        axes[i, 1].imshow(result['enhanced'])
        axes[i, 1].set_title(f"Улучшено\nB={result['predicted_brightness']:.2f}, C={result['predicted_contrast']:.2f}, S={result['predicted_saturation']:.2f}")
        axes[i, 1].axis('off')
    
    plt.tight_layout()
    plt.savefig(f'{results_dir}/comparison.png', dpi=150, bbox_inches='tight')
    print(f"Сравнение сохранено в {results_dir}/comparison.png")

print("\n5. Статистика:")
if results:
    print(f"   Всего обработано: {len(results)} изображений")
    print(f"   Успешно: {len(results)}")
    print(f"   Среднее изменение яркости: {np.mean([r['predicted_brightness'] for r in results]):.3f}")
    print(f"   Среднее изменение контраста: {np.mean([r['predicted_contrast'] for r in results]):.3f}")
    print(f"   Среднее изменение насыщенности: {np.mean([r['predicted_saturation'] for r in results]):.3f}")
    
    significant_changes = sum(1 for r in results 
                             if abs(r['predicted_brightness']) > 0.1 or 
                                abs(r['predicted_contrast'] - 1.0) > 0.1 or
                                abs(r['predicted_saturation'] - 1.0) > 0.1)
    print(f" Фото с существенными изменениями: {significant_changes}/{len(results)}")

with open(f'{results_dir}/report.txt', 'w', encoding='utf-8') as f:
    f.write("ОТЧЕТ ОБ ОЦЕНКЕ КАЧЕСТВА МОДЕЛИ\n")
    f.write("=" * 50 + "\n\n")
    f.write(f"Дата: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}\n")
    f.write(f"Всего изображений: {len(results)}\n\n")
    
    f.write("РЕЗУЛЬТАТЫ ПО КАЖДОМУ ИЗОБРАЖЕНИЮ:\n")
    f.write("-" * 50 + "\n")
    for r in results:
        f.write(f"\n{r['name']}\n")
        f.write(f"  Яркость: {r['predicted_brightness']:.3f}\n")
        f.write(f"  Контраст: {r['predicted_contrast']:.3f}\n")
        f.write(f"  Насыщенность: {r['predicted_saturation']:.3f}\n")

print(f"\n Текстовый отчет: {results_dir}/report.txt")

print("\n" + "=" * 60)
print("ОЦЕНКА КАЧЕСТВА ЗАВЕРШЕНА")
print("=" * 60)
print(f"\nРезультаты в папке: {results_dir}/")
print("Откройте comparison.png для визуальной оценки")