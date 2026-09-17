CREATE TABLE usuarios (
  id INT NOT NULL AUTO_INCREMENT,
  nombre VARCHAR(50) DEFAULT NULL,
  correo VARCHAR(100) DEFAULT NULL,
  password VARCHAR(255) DEFAULT NULL,
  rol ENUM('admin','maestro') DEFAULT 'maestro',
  usuario VARCHAR(50) DEFAULT NULL,
  PRIMARY KEY (id),
  UNIQUE KEY correo (correo)
);

CREATE TABLE materiales (
  id INT NOT NULL AUTO_INCREMENT,
  nombre VARCHAR(50) DEFAULT NULL,
  cantidad INT DEFAULT NULL,
  estado VARCHAR(20) DEFAULT NULL,
  categoria VARCHAR(50) DEFAULT NULL,
  foto VARCHAR(255) DEFAULT NULL,
  PRIMARY KEY (id)
);

CREATE TABLE prestamos (
  id INT NOT NULL AUTO_INCREMENT,
  material_id INT DEFAULT NULL,
  docente_id INT DEFAULT NULL,
  fecha_prestamo DATETIME DEFAULT NULL,
  hora_prestamo TIME DEFAULT NULL,
  fecha_devolucion DATETIME DEFAULT NULL,
  hora_devolucion TIME DEFAULT NULL,
  maestro VARCHAR(50) DEFAULT NULL,
  estado ENUM('Pendiente','Devuelto') DEFAULT 'Pendiente',
  PRIMARY KEY (id),
  KEY material_id (material_id),
  KEY fk_prestamos_docente (docente_id),
  CONSTRAINT fk_prestamos_docente FOREIGN KEY (docente_id) REFERENCES usuarios (id) ON DELETE SET NULL,
  CONSTRAINT prestamos_ibfk_1 FOREIGN KEY (material_id) REFERENCES materiales (id)
);

CREATE TABLE permisos (
  id INT NOT NULL AUTO_INCREMENT,
  maestro VARCHAR(100) NOT NULL,
  material_id INT NOT NULL,
  puede_ver TINYINT(1) DEFAULT 1,
  puede_prestar TINYINT(1) DEFAULT 0,
  puede_devolver TINYINT(1) DEFAULT 0,
  PRIMARY KEY (id),
  KEY material_id (material_id),
  CONSTRAINT permisos_ibfk_1 FOREIGN KEY (material_id) REFERENCES materiales (id)
);

CREATE TABLE auditoria_logs (
  id INT NOT NULL AUTO_INCREMENT,
  usuario VARCHAR(100) DEFAULT 'SISTEMA',
  accion VARCHAR(255) NOT NULL,
  detalles TEXT,
  fecha DATETIME DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id)
);