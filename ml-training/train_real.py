import os
import numpy as np
import tensorflow as tf
from tensorflow.keras import layers, models
import tensorflowjs as tfjs
from PIL import Image


def load_images_from_folder(folder_path, target_size=(128, 128), max_images=1000):
    images = []
    extensions = ['.jpg', '.jpeg', '.png', '.bmp']
    
    for filename in os.listdir(folder_path):
        if len(images) >= max_images:
            break
        if any(filename.lower().endswith(ext) for ext in extensions):
            filepath = os.path.join(folder_path, filename)
            try:
                img = Image.open(filepath).convert('RGB')
                img = img.resize(target_size)
                img_array = np.array(img, dtype=np.float32) / 255.0
                images.append(img_array)
            except Exception as e:
                print(f"Ошибка загрузки {filename}: {e}")
    
    return np.array(images)


def apply_enhancement(img, brightness, contrast, saturation):
    result = img.copy()
    
    result = np.clip(result + brightness, 0, 1)

    mean = result.mean()
    result = np.clip((result - mean) * contrast + mean, 0, 1)

    gray = np.mean(result, axis=2, keepdims=True)
    result = np.clip(gray + (result - gray) * saturation, 0, 1)
    
    return result


def create_synthetic_dataset(good_images, num_samples_per_image=10):
    X_bad = []
    y_params = []
    
    for img in good_images:
        for _ in range(num_samples_per_image):
            bad_brightness = np.random.uniform(-0.3, 0.3)
            bad_contrast = np.random.uniform(0.6, 1.4)
            bad_saturation = np.random.uniform(0.5, 1.5)
            
            bad_img = apply_enhancement(img, bad_brightness, bad_contrast, bad_saturation)
            
            restore_brightness = -bad_brightness
            restore_contrast = 1.0 / bad_contrast if bad_contrast != 0 else 1.0
            restore_saturation = 1.0 / bad_saturation if bad_saturation != 0 else 1.0
            
            restore_brightness = np.clip(restore_brightness, -0.5, 0.5)
            restore_contrast = np.clip(restore_contrast, 0.5, 2.0)
            restore_saturation = np.clip(restore_saturation, 0.5, 2.0)
            
            X_bad.append(bad_img)
            
            y_params.append([
                restore_brightness * 2.0,
                (restore_contrast - 1.0) * (2.0 / 1.5),
                (restore_saturation - 1.0) * (2.0 / 1.5)
            ])
    
    return np.array(X_bad), np.array(y_params)


def build_model():
    model = models.Sequential([
        layers.InputLayer(input_shape=(128, 128, 3)),
        
        layers.Conv2D(16, (3, 3), activation='relu', strides=2, padding='same'),
        layers.BatchNormalization(),
        
        layers.Conv2D(32, (3, 3), activation='relu', strides=2, padding='same'),
        layers.BatchNormalization(),
        
        layers.Conv2D(64, (3, 3), activation='relu', strides=2, padding='same'),
        layers.BatchNormalization(),
        
        layers.GlobalAveragePooling2D(),
        
        layers.Dense(64, activation='relu'),
        layers.Dropout(0.3),
        
        layers.Dense(3, activation='tanh')
    ])
    
    model.compile(
        optimizer=tf.keras.optimizers.Adam(learning_rate=0.001),
        loss='mse',
        metrics=['mae']
    )
    
    return model


def denormalize_params(predicted):
    brightness = predicted[0] / 2.0 
    contrast = predicted[1] * (1.5 / 2.0) + 1.0
    saturation = predicted[2] * (1.5 / 2.0) + 1.0
    
    brightness = np.clip(brightness, -0.4, 0.4)
    contrast = np.clip(contrast, 0.6, 1.5)
    saturation = np.clip(saturation, 0.7, 1.5)
    
    return brightness, contrast, saturation


def main():
    print("=" * 50)
    print(" ОБУЧЕНИЕ МОДЕЛИ УЛУЧШЕНИЯ ИЗОБРАЖЕНИЙ")
    print("=" * 50)
    
    print("\n1. Загрузка изображений")
    
    image_folders = ['./images', '../images', '/tmp/images']
    
    good_images = None
    for folder in image_folders:
        if os.path.exists(folder):
            print(f"   Найдена папка: {folder}")
            good_images = load_images_from_folder(folder, max_images=1000)
            break
    
    if good_images is None or len(good_images) == 0:
        print("   Папка не найдена")
        good_images = np.random.rand(20, 128, 128, 3).astype(np.float32)
    
    print(f"   Загружено {len(good_images)} изображений")
    
    print("\n2. Создание синтетического датасета")
    X, y = create_synthetic_dataset(good_images, num_samples_per_image=10)
    print(f"   Размер датасета: {X.shape[0]} образцов")
    print(f"   Форма X: {X.shape}, Y: {y.shape}")
    
    split_idx = int(len(X) * 0.8)
    X_train, X_val = X[:split_idx], X[split_idx:]
    y_train, y_val = y[:split_idx], y[split_idx:]
    
    print(f"   Train: {len(X_train)}, Val: {len(X_val)}")
    
    print("\n3. Создание модели")
    model = build_model()
    model.summary()
    
    print("\n4. Обучение модели")
    history = model.fit(
        X_train, y_train,
        validation_data=(X_val, y_val),
        epochs=100,
        batch_size=32,
        verbose=1
    )
    
    print("\n5. Оценка модели")
    val_loss, val_mae = model.evaluate(X_val, y_val, verbose=0)
    print(f"   Validation Loss: {val_loss:.4f}")
    print(f"   Validation MAE: {val_mae:.4f}")

    print("\n6. Тестирование на примерах")
    for i in range(3):
        idx = np.random.randint(0, len(X_val))
        test_img = X_val[idx:idx+1]
        true_params = y_val[idx]
        predicted = model.predict(test_img, verbose=0)[0]
        
        b, c, s = denormalize_params(predicted)
        print(f"   Пример {i+1}: brightness={b:.3f}, contrast={c:.3f}, saturation={s:.3f}")
    
    
    saved_model_dir = "/tmp/enhancer_model"
    os.makedirs(saved_model_dir, exist_ok=True)
    model.save(saved_model_dir + '/model.keras')
    print(f"   Модель сохранена в: {saved_model_dir}")
    
    export_dir = "../web-app/public/web_model"
    os.makedirs(export_dir, exist_ok=True)
    
    model_for_conversion = tf.keras.models.load_model(saved_model_dir + '/model.keras')
    tfjs.converters.save_keras_model(model_for_conversion, export_dir)
    
    files = os.listdir(export_dir)
    print(f"   Созданные файлы: {files}")
    
    model_json_path = os.path.join(export_dir, 'model.json')
    if os.path.exists(model_json_path):
        with open(model_json_path, 'r', encoding='utf-8') as f:
            json_content = f.read()
        
        json_content = json_content.replace('"batch_shape"', '"batch_input_shape"')
        
        with open(model_json_path, 'w', encoding='utf-8') as f:
            f.write(json_content)
    
    params_info = {
        "brightness_scale": 2.0,
        "contrast_scale": 1.5 / 2.0,
        "contrast_offset": 1.0,
        "saturation_scale": 1.5 / 2.0,
        "saturation_offset": 1.0,
        "min_brightness": -0.4,
        "max_brightness": 0.4,
        "min_contrast": 0.6,
        "max_contrast": 1.5,
        "min_saturation": 0.7,
        "max_saturation": 1.5
    }
    
    print("\n" + "=" * 50)
    print("ОБУЧЕНИЕ ЗАВЕРШЕНО")
    print("=" * 50)


if __name__ == "__main__":
    main()