import java.sql.Connection;
import java.sql.DatabaseMetaData;
import java.sql.DriverManager;
import java.sql.ResultSet;
import java.util.Properties;

public class ListJdbcSchemas {
    public static void main(String[] args) throws Exception {
        String driverClassName = args[0];
        String jdbcUrl = args[1];
        String username = args[2];
        String password = args[3];
        String catalog = args[4];

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

        // 连接数据库
        try (Connection connection = DriverManager.getConnection(jdbcUrl, properties)) {
            // 设置数据库
            if (!catalog.isEmpty()) {
                try {
                    connection.setCatalog(catalog);
                } catch (Exception ignored) {
                }
            }
            // 获取数据库元数据
            DatabaseMetaData metaData = connection.getMetaData();
            try (ResultSet schemas = metaData.getSchemas(catalog.isEmpty() ? null : catalog, null)) {
                while (schemas.next()) {
                    String schemaName = schemas.getString("TABLE_SCHEM");
                    if (schemaName != null && !schemaName.isEmpty()) {
                        System.out.println(schemaName);
                    }
                }
            }
        }
    }
}
