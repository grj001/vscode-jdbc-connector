import java.sql.Connection;
import java.sql.DatabaseMetaData;
import java.sql.DriverManager;
import java.sql.ResultSet;
import java.util.Properties;

public class ListJdbcTables {
    public static void main(String[] args) throws Exception {
        String driverClassName = args[0];
        String jdbcUrl = args[1];
        String username = args[2];
        String password = args[3];
        String catalog = args[4];
        String schema = args[5];

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
            if (!catalog.isEmpty()) {
                try {
                    connection.setCatalog(catalog);
                } catch (Exception ignored) {
                }
            }
            if (!schema.isEmpty()) {
                try {
                    connection.setSchema(schema);
                } catch (Exception ignored) {
                }
            }

            DatabaseMetaData metaData = connection.getMetaData();
            int index = 0;
            try (ResultSet tables = metaData.getTables(
                catalog.isEmpty() ? null : catalog
                , schema.isEmpty() ? null : schema, "%"
                , new String[] { "TABLE" }
            )) {
                while (tables.next()) {
                    String schemaName = tables.getString("TABLE_SCHEM");
                    String tableName = tables.getString("TABLE_NAME");
                    if (tableName == null || tableName.isEmpty()) {
                        continue;
                    }

                    System.out.println(schemaName + "." + tableName);
                }
            }
        }
    }
}
