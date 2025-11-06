# Proyecto Express.js CRUD con MariaDB

Este es un ejemplo de una API RESTful simple implementada con Express.js para realizar operaciones CRUD (Crear, Leer, Actualizar, Eliminar) sobre una tabla de películas, utilizando MariaDB (MySQL) como base de datos.

## 🚀 Tecnologías

- **Node.js**

- **Express.js** (Framework web)

- **MariaDB/MySQL** (Base de datos relacional)

- `mysql2/promise` (Driver de MariaDB/MySQL)

- `dotenv` (Gestión de variables de entorno)

- `express-validator` (Validación de datos)

## 🛠️ Configuración del Entorno

1. **Instalación de Dependencias**

    Asegúrate de tener Node.js instalado. Luego, una vez clonado el repositorio, instala las dependencias del proyecto:

    ```bash
    npm install
    ```

2. **Variables de Entorno**

    Copia el archivo llamado .env.example de la raíz del proyecto a otro archivo con el nombre .env y configura tus credenciales de base de datos.

    ```
    PORT=3000
    DB_HOST=localhost
    DB_USER=tu_usuario_mariadb
    DB_PASSWORD=tu_contraseña
    DB_NAME=nombre_de_tu_base_de_datos
    DB_PORT=3306
    ```

3. Configuración de la Base de Datos

    Ejecuta el siguiente script SQL en tu base de datos MariaDB para crear la tabla movies y sus registros de ejemplo:

    ```sql
    CREATE TABLE movies (
        id serial PRIMARY KEY,
        title character varying(150) NOT NULL,
        year integer,
        UNIQUE(title)
    );

    INSERT INTO movies (title, year) VALUES
    ('Inception', 2010),
    ('The Matrix', 1999),
    ('Pulp Fiction', 1994),
    ('The Dark Knight', 2008),
    ('Eternal Sunshine of the Spotless Mind', 2004),
    ('Forrest Gump', 1994),
    ('Fight Club', 1999),
    ('The Godfather', 1972),
    ('Interstellar', 2014),
    ('Parasite', 2019);
    ```

    Puedes usar el CLI de MySQL desde consola o gestores como `DBeaver` o `MySQL WorkBench`.

## ▶️ Ejecución del Proyecto

Para iniciar el servidor, ejecuta:

```bash
node app.js
```

El servidor se ejecutará en el puerto definido en tu archivo `.env` (por defecto, `http://localhost:3001`).

## 📚 Endpoints de la API

La API maneja la entidad `/movies` con los siguientes métodos:

| Método | URL | Descripción | Cuerpo de Solicitud (Body) |
| - | - | - | - |
| **GET** | `/movies` | Obtiene todas las películas. | |
| **GET** | `/movies/:id` | Obtiene una película por su ID. | |
| **POST** | `/movies` | Crea una nueva película. | `{ "title": "...", "year": 2024 }` |
| **PUT** | `/movies/:id` | Reemplaza una película. (Si no existe, la crea con ese ID) | `{ "title": "...", "year": 2024 }`
| **PATCH** | `/movies/:id` | Actualiza campos específicos de una película. | `{ "year": 2025 }` (opcional: `title`, `year`) |
| **DELETE** | `/movies/:id` | Elimina una película por su ID. | |

**Validación Importante**

- Los endpoints `POST` y `PUT` requieren que el campo `title` esté presente.

- El campo `title` debe ser único en la base de datos (validado antes de la inserción/actualización).