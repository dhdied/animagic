# Анимагия

Ребёнок рисует рыбку на бумаге → фотографирует на телефоне → рыбка выплывает на большом экране в виртуальном подводном мире. Рыбок можно кормить.

Готовый рабочий прототип, созданный в рамках хакатона: **Python (FastAPI + OpenCV)** на бэкенде, **Canvas/JS** для визуализации на «стене» — работает прямо в браузере. Архитектура построена по принципу **два устройства, клиент-сервер в локальной сети.**

Дополнительно: реализован **Unity-бэкенд** для конвейера «2D-рисунок → 3D-рыбка (.fbx)». Используется, когда нужна настоящая 3D-модель (например, для AR-приложения), а не плоский спрайт. Запускается из `unity_backend/`.

## Архитектура

```text
Устройство 1 (телефон)           Reverse Proxy (Nginx)            Устройство 2 (стена)
 ┌─────────────────┐             ┌───────────────────────────┐     ┌─────────────────────┐
 │  /scanner       │──GET/html──▶│ NGINX (Порт 8000)         │◀─── │  /wall              │
 │                 │             │ • Отдача статики          │     │  Canvas + JS        │
 │  photo.jpg      │──POST/api──▶│ • Проксирование WebSocket │──ws▶│  (WebSocket)        │
 └─────────────────┘             └──────┬───────────▲────────┘     └─────────────────────┘
                                        │           │
                                        ▼           │
                                 ┌───────────────────────────┐
                                 │ FastAPI + OpenCV          │
                                 │ • Выпрямление перспективы │
                                 │ • Вырезка рисунка         │
                                 │ • Генерация 3D (.fbx)     │
                                 └───────────────────────────┘
```

- **Узел «Сканер»** (`/scanner`): страница на телефоне. Ребёнок выбирает вид
  рыбки, фотографирует лист A4 с рисунком (или загружает готовое фото) и
  отправляет на сервер.
- **Nginx (Reverse Proxy)**: Отвечает за мгновенную отдачу статики (страницы /scanner, /wall, JS, CSS) и проксирование 
WebSocket-соединений.
- **FastAPI (Бэкенд)**: scanner.py через OpenCV находит на фото чёрную рамку трафарета, выпрямляет перспективу и вырезает рисунок. main.py рассылает готовый спрайт всем подключённым «стенам» по WebSocket.
- **Узел «Стена»** (`/wall`): открывается на большом экране/телевизоре.
  Подводная сцена на Canvas: лучи света, пузыри, песок, водоросли. Рыбки
  плавают по одному из трёх паттернов (синусоида / круг / случайное
  блуждание), тап по экрану бросает корм — ближайшие рыбки подплывают и
  «съедают» его.

## Запуск

Проект спроектирован для запуска в изолированной среде через Docker. Это избавляет от проблем с установкой системных библиотек (например, для OpenCV) и автоматически связывает Nginx с FastAPI.

Убедитесь, что у вас установлен Docker и Docker Compose.

```bash
# Сборка и запуск контейнеров в фоновом режиме
docker compose up -d --build
```
Система автоматически запустится и будет доступна на порту 8000.
(Для остановки проекта используйте команду ```docker compose down```).

## Подключение устройств

Узнайте локальный IP-адрес вашего компьютера (например, 192.168.1.42) и на двух устройствах, находящихся в одной Wi-Fi сети, откройте:

    Телефон: http://192.168.1.42:8000/scanner

    Стена (телевизор/ноутбук/проектор): http://192.168.1.42:8000/wall

Трафарет для печати: http://192.168.1.42:8000/assets/stencil_a4.svg (или локальный файл assets/stencil_a4.svg — распечатайте заранее на A4).

## Как работает трафарет

На листе A4 напечатана жирная чёрная рамка. Алгоритм в `scanner.py`:

1. Находит на фото самый большой четырёхугольный контур — это рамка.
2. Выпрямляет перспективу (`cv2.getPerspectiveTransform`), чтобы рамка,
   снятая под углом или на неровно лежащем листе, стала плоским
   прямоугольником фиксированного размера.
3. Внутри рамки адаптивным порогом отделяет рисунок (тёмные/цветные пиксели)
   от белой бумаги и делает бумагу прозрачной (альфа-канал).
4. Обрезает результат по границам рисунка — рыбка выходит компактным
   спрайтом без лишнего белого поля.

Если рамка не найдена целиком (плохой кадр, засветка) — сервер вернёт
понятную ошибку 422, а страница сканера попросит переснять.

Если рамки нет вообще (например маркер закончился, а принтера под рукой не
было) — можно нарисовать свою рамку от руки чёрным маркером на весь лист:
алгоритм ищет любой достаточно большой четырёхугольный контур, а не именно
напечатанный.

## Возможности

- Типы персонажей: 3 вида рыбок (золотая, тропическая, акулёнок) с индивидуальными паттернами движения и скоростью.

- Камера в браузере: Съёмка прямо через веб-интерфейс (getUserMedia) + фолбэк на обычную загрузку фото.

- Real-time обработка: Моментальная вырезка и рассылка всем подключенным клиентам.

- Интерактивная среда: Лучи света, пузыри, песок, водоросли, покачивание рыбок и механика кормления (реакция на клик/тап).

- Доступность: Уважение флага prefers-reduced-motion (приглушение декоративных анимаций).


## Планы на развитие

- Интеграция аппаратного сканера: Замена камеры телефона на USB-сканер (потребует изменений только на клиенте /scanner).

- Оптимизация рендеринга: Внедрение лимита на количество рыбок на экране (удаление старых при превышении порога N) в wall.js.

- Перенос визуализации на Unity: Использование готового Unity-клиента для подписки на /ws/wall и натягивания получаемых base64-спрайтов на 3D-плоскости.

## 3D-конвейер (Unity-бэкенд)

Сервер умеет генерировать 3D-модели рыбок (.fbx) на основе рисунков. На странице сканера есть кнопка «Сделать 3D-модель».

Процесс (POST /api/scan3d):

1. Вырезка PNG-спрайта (scanner.photo_to_fish_sprite()).

2. Попытка запуска unity_backend/ в headless-режиме: скрипт собирает процедурный меш, натягивает PNG как текстуру и экспортирует .fbx.

3. Python-fallback: Если Unity не установлен на хосте, срабатывает fish_mesh_builder.py (генерация меша через NumPy) и fbx_writer.py (запись минимального ASCII FBX 7.4, валидного для Blender/Maya/Unity).

Готовые модели сохраняются в generated/fbx/<id>.fbx и доступны по GET /api/fbx/<id>.

## Структура проекта

```
fish_wall/
├── server/
│   ├── main.py              # FastAPI: маршруты, WebSocket, рассылка
│   ├── scanner.py           # OpenCV: поиск рамки, вырезка спрайта
│   ├── unity_bridge.py      # Управление Unity batch-mode / fallback
│   ├── fish_mesh_builder.py # Fallback: генерация 3D-меша на NumPy
│   └── fbx_writer.py        # Fallback: генерация ASCII FBX
├── static/
│   ├── scanner.html & .js   # Клиент: мобильный сканер
│   ├── wall.html & .js      # Клиент: визуализация-стена
│   └── style.css            # Общие стили
├── unity_backend/           # Unity-проект для 3D-генерации
├── assets/
│   └── stencil_a4.svg       # Исходник трафарета
├── Dockerfile               # Конфигурация образа бэкенда
├── docker-compose.yaml      # Оркестрация контейнеров
├── nginx.conf               # Конфигурация Nginx (маршрутизация и статика)
└── requirements.txt         # Зависимости Python
```

## Команда проекта

<table>
  <tr>
    <td align="center">
      <a href="https://github.com/dhdied">
        <img src="https://github.com/dhdied.png" width="80" alt="dhdied"/><br />
        <sub><b>dhdied</b></sub>
      </a>
    </td>
    <td align="center">
      <a href="https://github.com/m0kas1">
        <img src="https://github.com/m0kas1.png" width="80" alt="m0kas1"/><br />
        <sub><b>m0kas1</b></sub>
      </a>
    </td>
    <td align="center">
      <a href="https://github.com/SonGodThalor">
        <img src="https://github.com/SonGodThalor.png" width="80" alt="SonGodThalor"/><br />
        <sub><b>SonGodThalor</b></sub>
      </a>
    </td>
    <td align="center">
      <a href="https://github.com/anyaspivik">
        <img src="https://github.com/anyaspivik.png" width="80" alt="anyaspivik"/><br />
        <sub><b>anyaspivik</b></sub>
      </a>
    </td>
    <td align="center">
      <a href="https://github.com/quewf">
        <img src="https://github.com/quewf.png" width="80" alt="quewf"/><br />
        <sub><b>quewf</b></sub>
      </a>
    </td>
    <td align="center">
      <a href="https://github.com/Alexandra2873">
        <img src="https://github.com/Alexandra2873.png" width="80" alt="sashkashnur"/><br />
        <sub><b>sashkashnur</b></sub>
      </a>
    </td>
  </tr>
  <tr>
    <td align="center">
      <a href="https://github.com/demonstersss">
        <img src="https://github.com/demonstersss.png" width="80" alt="demonstersss"/><br />
        <sub><b>demonstersss</b></sub>
      </a>
    </td>
    <td align="center">
      <a href="https://github.com/exenty-p">
        <img src="https://github.com/exenty-p.png" width="80" alt="exenty-p"/><br />
        <sub><b>exenty-p</b></sub>
      </a>
    </td>
    <td align="center">
      <a href="https://github.com/kikue322">
        <img src="https://github.com/kikue322.png" width="80" alt="kikue322"/><br />
        <sub><b>kikue322</b></sub>
      </a>
    </td>
    <td align="center">
      <a href="https://github.com/stepanbalakovser">
        <img src="https://github.com/stepanbalakovser.png" width="80" alt="stepanbalakovser"/><br />
        <sub><b>stepanbalakovser</b></sub>
      </a>
    </td>
    <td align="center">
      <a href="https://github.com/daniilsundeev2">
        <img src="https://github.com/daniilsundeev2.png" width="80" alt="daniilsundeev2"/><br />
        <sub><b>daniilsundeev2</b></sub>
      </a>
    </td>
   <td align="center">
      <a href="https://github.com/danek-shap">
        <img src="https://github.com/danek-shap.png" width="80" alt="danek-shap"/><br />
        <sub><b>danek-shap</b></sub>
      </a>
    </td>
  </tr>
</table>
