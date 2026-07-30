import java.sql.Connection;
import java.sql.DatabaseMetaData;
import java.sql.DriverManager;
import java.sql.ResultSet;
import java.util.Properties;

public class ListJdbcCatalogs {
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
            try (ResultSet catalogs = metaData.getCatalogs()) {
                while (catalogs.next()) {
                    String catalogName = catalogs.getString("TABLE_CAT");
                    if (catalogName != null && !catalogName.isEmpty()) {
                        System.out.println(catalogName);
                    }
                }
            }
        }
    }
}
