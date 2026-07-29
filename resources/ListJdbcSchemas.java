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
            DatabaseMetaData metaData = connection.getMetaData();
            try (ResultSet schemas = metaData.getSchemas()) {
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
