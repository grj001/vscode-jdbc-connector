import java.sql.Connection;
import java.sql.DriverManager;
import java.util.Properties;

public class TestJdbcConnection {
    public static void main(String[] args) throws Exception {
        String driverClassName = args[0];
        String jdbcUrl = args[1];
        String username = args[2];
        String password = args[3];
        String schema = args[4];

        if (!driverClassName.isEmpty()) {
            Class.forName(driverClassName);
        }

        Properties properties = new Properties();
        if (!username.isEmpty()) {
            properties.setProperty("user", username);
        }
        if (!password.isEmpty()) {
            properties.setProperty("password", password);
        }

        try (Connection connection = DriverManager.getConnection(jdbcUrl, properties)) {
            if (!schema.isEmpty()) {
                try {
                    connection.setSchema(schema);
                } catch (Exception ignored) {
                }
            }
            String productName = connection.getMetaData().getDatabaseProductName();
            String productVersion = connection.getMetaData().getDatabaseProductVersion();
            System.out.println(productName + " " + productVersion);
        }
    }
}
