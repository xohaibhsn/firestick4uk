-- Products Table
CREATE TABLE IF NOT EXISTS products (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  description TEXT,
  price DECIMAL(10,2) NOT NULL,
  category VARCHAR(100),
  badge VARCHAR(50),
  image VARCHAR(500),
  stock VARCHAR(50) DEFAULT 'Digital',
  active TINYINT(1) DEFAULT 1,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Orders Table
CREATE TABLE IF NOT EXISTS orders (
  id INT AUTO_INCREMENT PRIMARY KEY,
  order_id VARCHAR(20) UNIQUE NOT NULL,
  customer_name VARCHAR(255) NOT NULL,
  customer_email VARCHAR(255) NOT NULL,
  customer_phone VARCHAR(50) NOT NULL,
  delivery_address TEXT,
  city VARCHAR(100),
  postcode VARCHAR(20),
  notes TEXT,
  payment_method ENUM('bank_transfer','cod') DEFAULT 'bank_transfer',
  receipt_path VARCHAR(500),
  status ENUM('pending','confirmed','dispatched','delivered') DEFAULT 'pending',
  total DECIMAL(10,2) NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

-- Order Items Table
CREATE TABLE IF NOT EXISTS order_items (
  id INT AUTO_INCREMENT PRIMARY KEY,
  order_id VARCHAR(20) NOT NULL,
  product_id INT NOT NULL,
  product_name VARCHAR(255) NOT NULL,
  price DECIMAL(10,2) NOT NULL,
  quantity INT DEFAULT 1,
  FOREIGN KEY (order_id) REFERENCES orders(order_id)
);

-- Customers Table
CREATE TABLE IF NOT EXISTS customers (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  email VARCHAR(255) UNIQUE NOT NULL,
  phone VARCHAR(50),
  total_orders INT DEFAULT 0,
  total_spent DECIMAL(10,2) DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Blog Posts Table
CREATE TABLE IF NOT EXISTS blog_posts (
  id INT AUTO_INCREMENT PRIMARY KEY,
  title VARCHAR(500) NOT NULL,
  slug VARCHAR(500) UNIQUE NOT NULL,
  excerpt TEXT,
  content LONGTEXT,
  category VARCHAR(100),
  badge VARCHAR(50),
  emoji VARCHAR(10) DEFAULT '📝',
  published TINYINT(1) DEFAULT 1,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Insert Sample Products
INSERT INTO products (name, description, price, category, badge, stock) VALUES
('B1G 1 Month Plan', 'Perfect for trying out our premium subscription service. Instant activation.', 9.99, 'Subscription', NULL, 'Digital'),
('B1G 6 Month Plan', 'Great value 6-month subscription plan. Save more, enjoy more.', 49.99, 'Subscription', 'POPULAR', 'Digital'),
('B1G 1 Year Plan', 'Best value annual subscription plan. Maximum savings guaranteed.', 79.99, 'Subscription', 'BEST VALUE', 'Digital'),
('Firestick 4K', 'Amazon Firestick 4K — pre-configured and ready to use out of the box.', 39.99, 'Device', NULL, '12'),
('Firestick 4K Max', 'The most powerful Firestick available. Ultra-fast Wi-Fi 6 support.', 54.99, 'Device', 'NEW', '8'),
('Android Box Pro', 'High-performance Android TV box for the ultimate 4K home experience.', 49.99, 'Device', NULL, '5'),
('Android Box Ultra', 'Top-of-the-line Android box with 4GB RAM and 32GB storage.', 69.99, 'Device', NULL, '3'),
('Starter Bundle', 'Firestick 4K + 1 Month Plan — everything you need to get started today.', 44.99, 'Bundle', 'BUNDLE', '10');